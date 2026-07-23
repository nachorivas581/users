import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TextInput,
  StatusBar,
  Dimensions,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  RefreshControl,
  Modal,
  Alert,
  Animated,
  Easing,
  Linking,
  TVEventHandler,
  Switch,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// ============================================================
// CONFIGURACIÓN
// ============================================================
const { width: W, height: H } = Dimensions.get('window');
const isTV = Platform.isTV || (W >= 1280 && H >= 720);

const TMDB_API_KEY = 'cd567a4b1c99d7e5acebd57afda5a196';
const GOOGLE_DRIVE_API_KEY = 'AIzaSyAsQYU7JBhGalFd8woneHClsm5FJdOTHF4';
const DRIVE_FOLDER_PELICULAS = '10G68TcC3ywAUfyXz82QntyCRwb-2yKq2';
const DRIVE_FOLDER_SERIES = '1J4v2HMFaKy2ZKg20QU7kmH7k7rRV13Zh';
const DRIVE_FOLDER_ANIME = '1VSu2cmSG4E9pWAXcycCRnbzPxURuYzv7';
const DRIVE_FOLDER_DORAMAS = '1-MMGyBiFYnb-nBRUoz17rjpGhB6hy04V';
const M3U_URL = '';
const PROXY_URL = 'https://shy-bonus-5225.nachorivams581y.workers.dev';

// Detectar WebView antiguo (Android < 7.0)
const isLegacyWebView = Platform.OS === 'android' && Platform.Version < 24;

// ============================================================
// TIPOS
// ============================================================
interface Canal {
  id: string;
  numero: number;
  name: string;
  url: string;
  logo: string;
  category: string;
  nowPlaying?: string;
  embedSlug?: string;
  sources?: string[];
}

interface MediaItem {
  id: string;
  title: string;
  poster: string;
  backdrop?: string;
  year?: number;
  rating?: string;
  overview?: string;
  type?: 'movie' | 'tv';
  streamUrl?: string;
  driveFileId?: string;
  genreIds?: number[];
}

interface PlexShow {
  id: string;
  title: string;
  poster: string;
  backdrop?: string;
  year?: number;
  rating?: string;
  overview?: string;
  seasons: PlexSeason[];
  genreIds?: number[];
}

interface PlexSeason {
  number: number;
  label: string;
  episodes: PlexEpisode[];
}

interface PlexEpisode {
  id: string;
  code: string;
  title: string;
  streamUrl: string;
  driveFileId: string;
  fileName: string;
  poster?: string;
  overview?: string;
  airDate?: string;
  runtime?: number;
}

interface ContinueWatchingItem {
  id: string;
  title: string;
  poster: string;
  progress: number;
  duration: number;
  type: 'movie' | 'episode';
  streamUrl: string;
  showId?: string;
  showName?: string;
  episodeCode?: string;
  profileId?: string;
  watchedAt?: number;
}

interface Profile {
  id: string;
  name: string;
  avatar: string;
  isActive?: boolean;
}

// ============================================================
// UTILIDADES BASE
// ============================================================
function driveStreamUrl(fileId: string): string {
  return `${PROXY_URL}/${fileId}`;
}

function extractEmbedSlug(url: string): string | null {
  const m1 = url.match(/[?&]stream=([^&]+)/i);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]canal=([^&]+)/i);
  if (m2) return m2[1];
  return null;
}

function convertirMpdAHls(url: string): string {
  const regex = /^(https?:\/\/router\.cdn\.rcs\.net\.ar\/mnp\/([^/]+))\/output\.mpd$/i;
  const m = url.match(regex);
  if (m) return `${m[1]}_hls/playlist.m3u8`;
  return url;
}

function esUrlManifiesto(v: string): boolean {
  return /(\.m3u8|\.mpd)(\?|#|$)/i.test(v);
}

function normalizarUrl(url: string): string {
  let u = url.trim().replace(/\\\//g, '/');
  if (u.startsWith('//')) u = 'https:' + u;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  u = u.replace(/[^a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/, '');
  return u;
}

function limpiarNombreArchivo(nombre: string): { titulo: string; anio?: number } {
  let n = nombre.replace(/\.(mp4|mkv|avi|mov|webm|m4v)$/i, '');
  const matchAnio = n.match(/\b(19|20)\d{2}\b/);
  const anio = matchAnio ? parseInt(matchAnio[0], 10) : undefined;
  n = n.replace(/[._]/g, ' ');
  n = n.replace(/\b\d{1,2}[Xx]\d{1,3}\b/g, '');
  n = n.replace(/\b[Ss]\d{1,2}[Ee]\d{1,3}\b/g, '');
  n = n.replace(/\(.*?\)|\[.*?\]/g, ' ');
  n = n.replace(/\b(19|20)\d{2}\b/g, ' ');
  n = n.replace(
    /\b(1080p|720p|2160p|4k|hdr|web[-]?dl|bluray|brrip|hdtv|x264|x265|hevc|aac|dual|latino|castellano|subtitulado|temporada|cap(itulo)?s?|r480p|s\s?\d{1,2}|hd|full\s?hd|mic?rohd|proper|repack|internal|dubbed|subbed|español|ingles)\b/gi,
    ' '
  );
  n = n.replace(/\bS\d{1,2}(E\d{1,2})?\b/gi, ' ');
  n = n.replace(/\s{2,}/g, ' ').trim();
  return { titulo: n, anio };
}

async function lockLandscape() {
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  } catch (e) {
    console.log('[ORIENTATION] lockLandscape ERROR', e);
  }
}

// ============================================================
// FUNCIONES DE PERFIL
// ============================================================
const PROFILES_KEY = '@nexus_profiles';
const CURRENT_PROFILE_KEY = '@nexus_current_profile';

async function getProfiles(): Promise<Profile[]> {
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveProfiles(profiles: Profile[]) {
  await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

async function getCurrentProfileId(): Promise<string | null> {
  try {
    const id = await AsyncStorage.getItem(CURRENT_PROFILE_KEY);
    return id;
  } catch {
    return null;
  }
}

async function setCurrentProfileId(id: string) {
  await AsyncStorage.setItem(CURRENT_PROFILE_KEY, id);
}

async function getContinueWatching(profileId?: string): Promise<ContinueWatchingItem[]> {
  const pid = profileId || (await getCurrentProfileId()) || 'default';
  const raw = await AsyncStorage.getItem(`continueWatching_${pid}`);
  return raw ? JSON.parse(raw) : [];
}

async function saveContinueWatching(item: ContinueWatchingItem, profileId?: string) {
  try {
    const pid = profileId || (await getCurrentProfileId()) || 'default';
    const raw = await AsyncStorage.getItem(`continueWatching_${pid}`);
    const list: ContinueWatchingItem[] = raw ? JSON.parse(raw) : [];
    const existingIndex = list.findIndex(i => i.id === item.id);
    if (existingIndex >= 0) {
      list[existingIndex] = { ...list[existingIndex], ...item };
    } else {
      list.push(item);
    }
    const sorted = list.sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0));
    await AsyncStorage.setItem(`continueWatching_${pid}`, JSON.stringify(sorted));
  } catch (e) {
    console.log('[SAVE] Error guardando continuar viendo', e);
  }
}

async function getFavorites(profileId?: string): Promise<string[]> {
  const pid = profileId || (await getCurrentProfileId()) || 'default';
  const raw = await AsyncStorage.getItem(`favorites_${pid}`);
  return raw ? JSON.parse(raw) : [];
}

async function saveFavorites(favorites: string[], profileId?: string) {
  const pid = profileId || (await getCurrentProfileId()) || 'default';
  await AsyncStorage.setItem(`favorites_${pid}`, JSON.stringify(favorites));
}

// ============================================================
// GOOGLE DRIVE HELPERS
// ============================================================
const tmdbSessionCache = new Map<string, any>();

async function buscarMetadataTMDB(titulo: string, anio: number | undefined, tipo: 'movie' | 'tv'): Promise<any | null> {
  const cacheKey = `${tipo}:${titulo}:${anio || ''}`;
  if (tmdbSessionCache.has(cacheKey)) return tmdbSessionCache.get(cacheKey);
  try {
    const ep = tipo === 'movie' ? 'search/movie' : 'search/tv';
    const yr = anio ? `&year=${anio}` : '';
    const url = `https://api.themoviedb.org/3/${ep}?api_key=${TMDB_API_KEY}&language=es&query=${encodeURIComponent(titulo)}${yr}`;
    const res = await fetch(url);
    const d = await res.json();
    const result = d.results?.length ? d.results[0] : null;
    tmdbSessionCache.set(cacheKey, result);
    return result;
  } catch (e) {
    console.log('[TMDB] ERROR buscando metadata', titulo, e);
    return null;
  }
}

async function listarArchivosDrive(folderId: string): Promise<any[]> {
  let archivos: any[] = [],
    pageToken: string | undefined;
  do {
    const tp = pageToken ? `&pageToken=${pageToken}` : '';
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime)&pageSize=1000&key=${GOOGLE_DRIVE_API_KEY}${tp}`;
    const res = await fetch(url);
    const d = await res.json();
    if (d.files) archivos = archivos.concat(d.files);
    pageToken = d.nextPageToken;
  } while (pageToken);
  return archivos.filter(f => f.mimeType?.startsWith('video/'));
}

async function listarSubcarpetasDrive(folderId: string): Promise<any[]> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)&key=${GOOGLE_DRIVE_API_KEY}`;
    const res = await fetch(url);
    const d = await res.json();
    return d.files || [];
  } catch (e) {
    return [];
  }
}

async function cargarCarpetaDrive(folderId: string, tipo: 'movie' | 'tv', cacheKey: string): Promise<MediaItem[]> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    const cache = raw ? JSON.parse(raw) : {};
    const archivos = await listarArchivosDrive(folderId);
    console.log(`[DRIVE] ${cacheKey}: ${archivos.length} archivos encontrados`);
    const items: MediaItem[] = [];
    for (const a of archivos) {
      const ce = cache[a.id];
      if (ce && ce.modifiedTime === a.modifiedTime) {
        items.push(ce.item);
      } else {
        const { titulo, anio } = limpiarNombreArchivo(a.name);
        const streamUrl = driveStreamUrl(a.id);
        const meta = await buscarMetadataTMDB(titulo, anio, tipo);
        const item: MediaItem = {
          id: `drive-${a.id}`,
          title: meta ? (tipo === 'movie' ? meta.title : meta.name) : titulo || a.name,
          poster: meta?.poster_path
            ? `https://image.tmdb.org/t/p/w500${meta.poster_path}`
            : 'https://via.placeholder.com/500x750.png?text=Sin+Imagen',
          backdrop: meta?.backdrop_path ? `https://image.tmdb.org/t/p/w780${meta.backdrop_path}` : undefined,
          year:
            tipo === 'movie'
              ? meta?.release_date
                ? new Date(meta.release_date).getFullYear()
                : anio
              : meta?.first_air_date
              ? new Date(meta.first_air_date).getFullYear()
              : anio,
          rating: meta?.vote_average ? meta.vote_average.toFixed(1) : '0.0',
          overview: meta?.overview || 'Sin descripción disponible.',
          type: tipo,
          streamUrl,
          driveFileId: a.id,
          genreIds: meta?.genre_ids || [],
        };
        cache[a.id] = { modifiedTime: a.modifiedTime, item };
        items.push(item);
      }
    }
    await AsyncStorage.setItem(cacheKey, JSON.stringify(cache));
    console.log(`[DRIVE] ${cacheKey}: ${items.length} items listos`);
    return items;
  } catch (e) {
    console.log('[DRIVE] ERROR cargarCarpetaDrive', folderId, e);
    return [];
  }
}

function parsePlexEpisode(nombre: string): { showName: string; season: number; episode: number; episodeTitle?: string } | null {
  let clean = nombre.replace(/\.(mp4|mkv|avi|mov|webm|m4v)$/i, '');
  clean = clean.replace(/\.{2,}/g, '.');
  const epPattern = /(\d{1,2})[Xx](\d{1,3})/;
  const epMatch = clean.match(epPattern);
  if (!epMatch) return null;
  const season = parseInt(epMatch[1], 10);
  const episode = parseInt(epMatch[2], 10);
  const epIndex = clean.search(epPattern);
  let showName = '';
  if (epIndex > 0) {
    showName = clean.substring(0, epIndex).trim().replace(/[._-]+/g, ' ').trim();
  }
  let title = '';
  const afterEp = clean.substring(epIndex + epMatch[0].length).trim();
  if (afterEp) {
    let possibleTitle = afterEp.replace(/^[-–\s]+/, '').replace(/[-–\s]+$/, '');
    if (possibleTitle) {
      possibleTitle = possibleTitle
        .replace(
          /\b(1080p|720p|2160p|4k|hdr|web[-]?dl|bluray|brrip|hdtv|x264|x265|hevc|aac|dual|latino|castellano|subtitulado|proper|repack|internal|dubbed|subbed|español|ingles|cap(itulo)?s?|temporada)\b/gi,
          ''
        )
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (possibleTitle && possibleTitle.length >= 2) {
        title = possibleTitle;
      }
    }
  }
  return { showName, season, episode, episodeTitle: title || undefined };
}

async function cargarSeriesPlex(folderId: string, cacheKey: string): Promise<PlexShow[]> {
  try {
    const rawCache = await AsyncStorage.getItem(cacheKey + '_plex');
    const cache = rawCache ? JSON.parse(rawCache) : {};
    const [archivosRaiz, subcarpetas] = await Promise.all([
      listarArchivosDrive(folderId),
      listarSubcarpetasDrive(folderId),
    ]);
    console.log(`[PLEX] ${cacheKey}: ${archivosRaiz.length} archivos raiz, ${subcarpetas.length} subcarpetas`);

    const showsMap: Record<
      string,
      {
        files: {
          archivo: any;
          season: number;
          episode: number;
          episodeTitle?: string;
          carpetaNombre?: string;
        }[];
        tmdbMeta?: any;
      }
    > = {};

    const addFileToShow = (
      archivo: any,
      nombreCarpeta: string,
      season: number,
      episode: number,
      episodeTitle?: string
    ) => {
      const parsed = parsePlexEpisode(archivo.name);
      const showNameFromFile = parsed?.showName || '';
      const finalShowName = showNameFromFile || nombreCarpeta || '';
      const key = finalShowName.toLowerCase().replace(/\s+/g, '_');
      if (!showsMap[key]) showsMap[key] = { files: [] };
      const rawTitle = parsed?.episodeTitle || episodeTitle;
      const finalTitle = rawTitle && rawTitle.length >= 2 ? rawTitle : undefined;
      showsMap[key].files.push({
        archivo,
        season: parsed?.season || season,
        episode: parsed?.episode || episode,
        episodeTitle: finalTitle,
        carpetaNombre: nombreCarpeta || '',
      });
    };

    for (const a of archivosRaiz) {
      const parsed = parsePlexEpisode(a.name);
      if (parsed && parsed.showName) {
        addFileToShow(a, parsed.showName, parsed.season, parsed.episode, parsed.episodeTitle);
      } else if (parsed) {
        const cleanName = limpiarNombreArchivo(a.name).titulo || 'Sin nombre';
        addFileToShow(a, cleanName, parsed.season, parsed.episode, parsed.episodeTitle);
      }
    }

    for (const carpeta of subcarpetas) {
      const nombreCarpeta = carpeta.name.replace(/[._]/g, ' ').trim();
      const archivosShow = await listarArchivosDrive(carpeta.id);
      let epIdx = 1;
      for (const a of archivosShow) {
        const parsed = parsePlexEpisode(a.name);
        if (parsed) {
          addFileToShow(a, nombreCarpeta, parsed.season, parsed.episode, parsed.episodeTitle);
        } else {
          addFileToShow(a, nombreCarpeta, 1, epIdx++);
        }
      }
      const temporadas = await listarSubcarpetasDrive(carpeta.id);
      for (const temp of temporadas) {
        const seasonMatch = temp.name.match(/(\d+)/);
        const seasonNum = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;
        const archivosTemp = await listarArchivosDrive(temp.id);
        let epIdxTemp = 1;
        for (const a of archivosTemp) {
          const parsed = parsePlexEpisode(a.name);
          if (parsed) {
            addFileToShow(a, nombreCarpeta, parsed.season || seasonNum, parsed.episode);
          } else {
            addFileToShow(a, nombreCarpeta, seasonNum, epIdxTemp++);
          }
        }
      }
    }

    const shows: PlexShow[] = [];
    for (const [key, data] of Object.entries(showsMap)) {
      if (!data.files.length) continue;
      const firstFile = data.files[0];
      const parsed0 = parsePlexEpisode(firstFile.archivo.name);
      let showName = parsed0?.showName || '';
      if (!showName && firstFile.carpetaNombre) {
        showName = firstFile.carpetaNombre;
      }
      if (!showName) {
        showName = limpiarNombreArchivo(firstFile.archivo.name).titulo || firstFile.archivo.name;
      }

      let meta = cache[showName];
      if (!meta) {
        meta = await buscarMetadataTMDB(showName, undefined, 'tv');
        if (meta) cache[showName] = meta;
      }

      const seasonMap: Record<number, PlexEpisode[]> = {};
      for (const f of data.files) {
        if (!seasonMap[f.season]) seasonMap[f.season] = [];
        const streamUrl = driveStreamUrl(f.archivo.id);
        const epCode = `${f.season}x${String(f.episode).padStart(2, '0')}`;
        seasonMap[f.season].push({
          id: `ep-${f.archivo.id}`,
          code: epCode,
          title: f.episodeTitle || `Episodio ${f.episode}`,
          streamUrl,
          driveFileId: f.archivo.id,
          fileName: f.archivo.name,
        });
      }

      const seasons: PlexSeason[] = Object.entries(seasonMap)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([n, eps]) => ({
          number: parseInt(n, 10),
          label: `Temporada ${n}`,
          episodes: eps.sort(
            (a, b) => parseInt(a.code.split('x')[1], 10) - parseInt(b.code.split('x')[1], 10)
          ),
        }));

      const title = meta ? meta.name || meta.title || showName : showName;
      shows.push({
        id: `show-${key}`,
        title,
        poster: meta?.poster_path
          ? `https://image.tmdb.org/t/p/w500${meta.poster_path}`
          : 'https://via.placeholder.com/500x750.png?text=Serie',
        backdrop: meta?.backdrop_path ? `https://image.tmdb.org/t/p/w780${meta.backdrop_path}` : undefined,
        year: meta?.first_air_date ? new Date(meta.first_air_date).getFullYear() : undefined,
        rating: meta?.vote_average ? meta.vote_average.toFixed(1) : undefined,
        overview: meta?.overview,
        seasons,
        genreIds: meta?.genre_ids || [],
      });
    }

    await AsyncStorage.setItem(cacheKey + '_plex', JSON.stringify(cache));
    console.log(`[PLEX] ${cacheKey}: ${shows.length} shows armados`);
    return shows.sort((a, b) => a.title.localeCompare(b.title));
  } catch (e) {
    console.log('[PLEX] ERROR cargarSeriesPlex', folderId, e);
    return [];
  }
}

// ============================================================
// CANALES MANUALES
// ============================================================
const CANALES_MANUALES: Canal[] = [
  { id: 'man-1', numero: 1, name: 'Directv Sports', embedSlug: 'dsports', logo: 'https://media.bss-prd.directvgo.com/media/catalog/product/cache/74c1057f7991b4edb2bc7bdaa94de933/l/o/logo-directv-sports_4x3_final.png', category: 'Deportes', nowPlaying: 'Fútbol: Copa Libertadores', url: 'https://streamhdx.com/live1.php?stream=dsports' },
  { id: 'man-2', numero: 2, name: 'Direct Sports 2', embedSlug: 'dsports2', logo: 'https://canalesenvivo.masterperu.club/wp-content/uploads/2025/01/DirecTV-Sports-2.webp', category: 'Deportes', nowPlaying: 'Directv Sports 2', url: 'https://streamhdx.com/live1.php?stream=dsports2' },
  { id: 'man-3', numero: 3, name: 'Direct Sports +', embedSlug: 'dsportsplus', logo: 'https://telelibrefull.com/img/dsportsplus.webp', category: 'Deportes', nowPlaying: 'Directv Sports +', url: 'https://streamhdx.com/live1.php?stream=dsportsplus' },
  { id: 'man-4', numero: 4, name: 'TyC Sports', embedSlug: 'tycsports', logo: 'https://w7.pngwing.com/pngs/290/978/png-transparent-logo-tyc-sports-brand-trademark-mosaic-blue-text-highdefinition-video.png', category: 'Deportes', nowPlaying: 'TyC Sports', url: 'https://streamhdx.com/live1.php?stream=tycsports' },
  { id: 'man-5', numero: 5, name: 'TNT Sports', embedSlug: 'tntsports', logo: 'https://thumbnail.imgbin.com/6/1/14/tnt-sports-logo-Ty0R9jPq_t.jpg', category: 'Deportes', nowPlaying: 'TNT Sports', url: 'https://streamhdx.com/live1.php?stream=tntsports' },
  { id: 'man-6', numero: 6, name: 'ESPN Premium', embedSlug: 'espnpremium', logo: 'https://static.wikia.nocookie.net/logopedia/images/0/0b/ESPN_Premium_%282022%29_Red_and_Black.svg/revision/latest/scale-to-width-down/250?cb=20220505042921', category: 'Deportes', nowPlaying: 'ESPN Premium', url: 'https://streamhdx.com/live1.php?stream=espnpremium' },
  { id: 'man-7', numero: 7, name: 'ESPN 1', embedSlug: 'espn', logo: 'https://1000marcas.net/wp-content/uploads/2020/02/logo-ESPN.png', category: 'Deportes', nowPlaying: 'ESPN 1', url: 'https://streamhdx.com/live1.php?stream=espn1' },
  { id: 'man-8', numero: 8, name: 'ESPN 2', embedSlug: 'espn2', logo: '', category: 'Deportes', nowPlaying: 'ESPN 2', url: 'https://streamhdx.com/live1.php?stream=espn2' },
  { id: 'man-9', numero: 9, name: 'ESPN 3', embedSlug: 'espn3', logo: '', category: 'Deportes', nowPlaying: 'ESPN 3', url: 'https://streamhdx.com/live1.php?stream=espn3' },
  { id: 'man-10', numero: 10, name: 'ESPN 4', embedSlug: 'espn4', logo: '', category: 'Deportes', nowPlaying: 'ESPN 4', url: 'https://streamhdx.com/live1.php?stream=espn4' },
  { id: 'man-11', numero: 11, name: 'ESPN 5', embedSlug: 'espn5', logo: '', category: 'Deportes', nowPlaying: 'ESPN 5', url: 'https://streamhdx.com/live1.php?stream=espn5' },
  { id: 'man-12', numero: 12, name: 'ESPN 6', embedSlug: 'espn6', logo: '', category: 'Deportes', nowPlaying: 'ESPN 6', url: 'https://streamhdx.com/live1.php?stream=espn6' },
  { id: 'man-13', numero: 13, name: 'Telefe', embedSlug: 'telefe', logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTVGWf31NqZE7xF9W_J8K5cQ8r_14gu4Nvw7H1JaG1U5oGqc76QEY_54PcO&s=10', category: 'Deportes', nowPlaying: 'Telefe', url: 'https://streamhdx.com/live1.php?stream=telefe' },
  { id: 'man-14', numero: 14, name: 'TNT Series', embedSlug: 'tntseries', logo: '', category: 'Entretenimiento', nowPlaying: 'TNT Series', url: 'https://streamhdx.com/live1.php?stream=tntseries' },
  { id: 'man-15', numero: 15, name: 'Disney Channel', embedSlug: 'disneychannel', logo: '', category: 'Entretenimiento', nowPlaying: 'Disney Channel', url: 'https://streamhdx.com/live1.php?stream=disney' },
  { id: 'man-16', numero: 16, name: 'TNT', embedSlug: 'tnt', logo: '', category: 'Entretenimiento', nowPlaying: 'TNT', url: 'https://streamhdx.com/live1.php?stream=tnt' },
  { id: 'man-17', numero: 17, name: 'Warner Channel', embedSlug: 'warnerchannel', logo: '', category: 'Entretenimiento', nowPlaying: 'Warner Channel', url: 'https://streamhdx.com/live1.php?stream=warner' },
  { id: 'man-18', numero: 18, name: 'FX', embedSlug: 'fx', logo: '', category: 'Entretenimiento', nowPlaying: 'FX', url: 'https://streamhdx.com/live1.php?stream=fx' },
  { id: 'man-19', numero: 19, name: 'Comedy Central', embedSlug: 'comedycentral', logo: '', category: 'Entretenimiento', nowPlaying: 'Comedy Central', url: 'https://streamhdx.com/live1.php?stream=comedy' },
  { id: 'man-20', numero: 20, name: 'Golden', embedSlug: 'golden', logo: '', category: 'Entretenimiento', nowPlaying: 'Golden', url: 'https://streamhdx.com/live1.php?stream=golden' },
  { id: 'man-21', numero: 21, name: 'Golden Edge', embedSlug: 'goldenedge', logo: '', category: 'Entretenimiento', nowPlaying: 'Golden Edge', url: 'https://streamhdx.com/live1.php?stream=goldenedge' },
  { id: 'man-22', numero: 22, name: 'Discovery SCI', embedSlug: 'discoveryscience', logo: '', category: 'Deportes', nowPlaying: 'Discovery SCI', url: 'https://gambeta.vip/canal/discovery-science' },
  { id: 'man-23', numero: 23, name: 'Universal Premiere', embedSlug: 'universalpremiere', logo: '', category: 'Deportes', nowPlaying: 'Universal Premiere', url: 'https://streamhdx.com/live1.php?stream=universalpremiere' },
  { id: 'man-24', numero: 24, name: 'Animal Planet', embedSlug: 'animalplanet', logo: '', category: 'Deportes', nowPlaying: 'Animal Planet', url: 'https://streamhdx.com/live1.php?stream=animalplanet' },
  { id: 'man-25', numero: 25, name: 'Discovery Turbo', embedSlug: 'discoveryturbo', logo: '', category: 'Deportes', nowPlaying: 'Discovery Turbo', url: 'https://streamhdx.com/live1.php?stream=discoveryturbo' },
  { id: 'man-33', numero: 33, name: 'TNT Novelas', embedSlug: 'tntnovelas', logo: '', category: 'Deportes', nowPlaying: 'TNT Novelas', url: 'https://streamhdx.com/live1.php?stream=tntnovelas' },
];

// ============================================================
// SISTEMA DE MONITOREO DE TOKENS Y CACHÉ AVANZADO
// ============================================================
const streamCache = new Map<string, { 
  stream: string; 
  timestamp: number; 
  expiresAt?: number; 
  ttl?: number;
  renewalTimer?: NodeJS.Timeout;
}>();
const DEFAULT_CACHE_TTL = 30 * 60 * 1000;

function extractExpirationInfo(url: string): { expiresAt?: number; ttl?: number } {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    const expiresParam = params.get('expires') || params.get('expiration') || params.get('e');
    if (expiresParam) {
      const timestamp = parseInt(expiresParam, 10);
      const expiresMs = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
      const now = Date.now();
      if (expiresMs > now) return { expiresAt: expiresMs, ttl: expiresMs - now };
    }
    if (params.has('token') || params.has('signature') || params.has('auth') || params.has('_=')) {
      return { ttl: 5 * 60 * 1000 };
    }
    const timeParam = params.get('t') || params.get('_') || params.get('time');
    if (timeParam) {
      const timestamp = parseInt(timeParam, 10);
      if (timestamp > 1000000000) {
        const expiresMs = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
        const now = Date.now();
        if (expiresMs > now) return { expiresAt: expiresMs, ttl: expiresMs - now };
      }
    }
    return {};
  } catch {
    return {};
  }
}

function scheduleRenewal(
  cacheKey: string,
  expiresAt: number,
  onRenew: () => Promise<string | null>
): NodeJS.Timeout | null {
  const now = Date.now();
  const timeUntilExpiry = expiresAt - now;
  if (timeUntilExpiry <= 0) return null;
  const renewDelay = Math.max(0, timeUntilExpiry - 30 * 1000);
  if (renewDelay > 5 * 1000) {
    return setTimeout(async () => {
      try {
        const newStream = await onRenew();
        if (newStream) {
          const info = extractExpirationInfo(newStream);
          const expiresAt = info.expiresAt || Date.now() + (info.ttl || DEFAULT_CACHE_TTL);
          const entry = streamCache.get(cacheKey);
          if (entry) {
            if (entry.renewalTimer) clearTimeout(entry.renewalTimer);
            streamCache.set(cacheKey, {
              ...entry,
              stream: newStream,
              timestamp: Date.now(),
              expiresAt: expiresAt,
              ttl: info.ttl || entry.ttl || DEFAULT_CACHE_TTL,
            });
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('streamRenewed', { detail: { cacheKey, newStream } }));
          }
        } else {
          setTimeout(() => {
            const entry = streamCache.get(cacheKey);
            if (entry) {
              const timer = scheduleRenewal(cacheKey, Date.now() + 5000, onRenew);
              if (timer) { entry.renewalTimer = timer; streamCache.set(cacheKey, entry); }
            }
          }, 5000);
        }
      } catch (e) {
        setTimeout(() => {
          const entry = streamCache.get(cacheKey);
          if (entry) {
            const timer = scheduleRenewal(cacheKey, Date.now() + 5000, onRenew);
            if (timer) { entry.renewalTimer = timer; streamCache.set(cacheKey, entry); }
          }
        }, 5000);
      }
    }, renewDelay);
  }
  return null;
}

// ============================================================
// EXTRACCIÓN CON PROXY (SIN WebView) - PRIORITARIO PARA LEGACY
// ============================================================
function toHttp(url: string): string {
  return url.replace(/^https:\/\//i, 'http://');
}

async function extractWithAllOrigins(url: string): Promise<string | null> {
  try {
    const httpUrl = toHttp(url);
    const proxyUrl = `http://api.allorigins.win/raw?url=${encodeURIComponent(httpUrl)}`;
    const res = await fetch(proxyUrl);
    const html = await res.text();
    const match = html.match(/(?:https?:)?\/{1,2}[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
    if (match) return normalizarUrl(match[0]);
    return null;
  } catch (e) {
    return null;
  }
}

async function extractWithCorsProxy(url: string): Promise<string | null> {
  try {
    const httpUrl = toHttp(url);
    const proxyUrl = `http://corsproxy.io/?url=${encodeURIComponent(httpUrl)}`;
    const res = await fetch(proxyUrl);
    const html = await res.text();
    const match = html.match(/(?:https?:)?\/{1,2}[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
    if (match) return normalizarUrl(match[0]);
    return null;
  } catch {
    return null;
  }
}

async function extractWithJina(url: string): Promise<string | null> {
  try {
    const httpUrl = toHttp(url);
    const proxyUrl = `https://r.jina.ai/${httpUrl}`;
    const res = await fetch(proxyUrl);
    const html = await res.text();
    const match = html.match(/(?:https?:)?\/{1,2}[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
    if (match) return normalizarUrl(match[0]);
    return null;
  } catch {
    return null;
  }
}

async function extractWithMultipleProxies(url: string): Promise<string | null> {
  const proxies = [extractWithAllOrigins, extractWithCorsProxy, extractWithJina];
  for (const proxyFn of proxies) {
    const stream = await proxyFn(url);
    if (stream) return stream;
  }
  return null;
}

// ============================================================
// FUNCIÓN PRINCIPAL DE RESOLUCIÓN DE STREAMS (con prioridad legacy)
// ============================================================
let extraerConWebViewRef: any = null;

async function resolveStreamWithRenewal(
  embedSlug?: string,
  urlBase?: string,
  forceProxy: boolean = false
): Promise<string | null> {
  const cacheKey = embedSlug || urlBase || 'default';
  
  const cached = streamCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < (cached.ttl || DEFAULT_CACHE_TTL)) {
    if (cached.expiresAt && cached.expiresAt > Date.now()) {
      return cached.stream;
    } else if (cached.expiresAt && cached.expiresAt <= Date.now()) {
      streamCache.delete(cacheKey);
    } else {
      return cached.stream;
    }
  }

  let stream: string | null = null;

  if (isLegacyWebView || forceProxy) {
    if (urlBase) {
      stream = await extractWithMultipleProxies(urlBase);
    }
    if (!stream && embedSlug) {
      const urls = [
        `https://regionales.saohgdasregions.fun/stream.php?canal=${embedSlug}`,
        `https://streamhdx.com/live1.php?stream=${embedSlug}`,
        `https://gambeta.vip/canal/${embedSlug}`,
        `https://librepelota.su/es/${embedSlug}/`,
      ];
      for (const u of urls) {
        stream = await extractWithMultipleProxies(u);
        if (stream) break;
      }
    }
  }

  if (!stream && !isLegacyWebView && urlBase && extraerConWebViewRef) {
    stream = await extraerConWebViewRef(urlBase);
  }

  if (!stream && urlBase && esUrlManifiesto(urlBase)) {
    stream = urlBase;
  }

  if (stream) {
    const info = extractExpirationInfo(stream);
    const expiresAt = info.expiresAt || (info.ttl ? Date.now() + info.ttl : undefined);
    const ttl = info.ttl || DEFAULT_CACHE_TTL;
    const cacheEntry: any = { stream, timestamp: Date.now(), ttl, expiresAt };
    if (expiresAt && expiresAt > Date.now()) {
      const onRenew = async () => resolveStreamWithRenewal(embedSlug, urlBase, true);
      const timer = scheduleRenewal(cacheKey, expiresAt, onRenew);
      if (timer) cacheEntry.renewalTimer = timer;
    }
    streamCache.set(cacheKey, cacheEntry);
    return stream;
  }

  return null;
}

// ============================================================
// COMPONENTE FOCUSABLE (con soporte TV)
// ============================================================
const Focusable = memo(({
  children,
  onPress,
  onLongPress,
  style,
  activeOpacity = 0.7,
  hasTVPreferredFocus = false,
  tvParallaxProperties,
  ...props
}: any) => {
  const [focused, setFocused] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1.08 : 1,
      friction: 4,
      tension: 150,
      useNativeDriver: true,
    }).start();
    Animated.timing(glowAnim, {
      toValue: focused ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [focused]);

  const focusableStyle = [
    style,
    focused && stylesTV.focused,
    { transform: [{ scale: scaleAnim }] },
    focused && {
      shadowColor: '#ff1744',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.8] }),
      shadowRadius: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 25] }),
      elevation: focused ? 15 : 0,
    },
  ];

  return (
    <TouchableOpacity
      {...props}
      style={focusableStyle}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={activeOpacity}
      hasTVPreferredFocus={hasTVPreferredFocus}
      tvParallaxProperties={tvParallaxProperties || { enabled: true, shiftDistanceX: 10, shiftDistanceY: 10, tiltAngle: 0.05, magnification: 1.05 }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {children}
    </TouchableOpacity>
  );
});

// ============================================================
// COMPONENTES MODALES: SourceSelector y ResumeDialog
// ============================================================
const SourceSelectorModal = memo(({
  visible,
  options,
  selectedIndex,
  onSelect,
  onClose,
}: {
  visible: boolean;
  options: { label: string; url: string }[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}) => {
  if (!visible) return null;
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={stylesTV.sourceModalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={stylesTV.sourceModalContent}>
          <View style={stylesTV.sourceModalHeader}>
            <Text style={stylesTV.sourceModalTitle}>📡 Seleccionar fuente</Text>
            <Focusable onPress={onClose}>
              <Ionicons name="close" size={isTV ? 36 : 28} color="#fff" />
            </Focusable>
          </View>
          {options.map((opt, idx) => (
            <Focusable
              key={idx}
              style={[stylesTV.sourceOption, idx === selectedIndex && stylesTV.sourceOptionSelected]}
              onPress={() => {
                onSelect(idx);
                onClose();
              }}
              hasTVPreferredFocus={idx === 0}
            >
              <Text style={[stylesTV.sourceOptionText, idx === selectedIndex && stylesTV.sourceOptionTextSelected]}>
                {opt.label}
              </Text>
              {idx === selectedIndex && <Ionicons name="checkmark-circle" size={isTV ? 28 : 22} color="#ff1744" />}
            </Focusable>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
});

const ResumeDialog = memo(({
  visible,
  item,
  onResume,
  onRestart,
  onCancel,
}: {
  visible: boolean;
  item: ContinueWatchingItem | null;
  onResume: () => void;
  onRestart: () => void;
  onCancel: () => void;
}) => {
  if (!visible || !item) return null;
  const progressPercent = item.duration > 0 ? Math.min(100, (item.progress / item.duration) * 100) : 0;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity style={stylesTV.resumeOverlay} activeOpacity={1} onPress={onCancel}>
        <View style={stylesTV.resumeContent}>
          <View style={stylesTV.resumeHeader}>
            <Text style={stylesTV.resumeTitle}>⏳ ¿Dónde quieres comenzar?</Text>
            <Focusable onPress={onCancel}>
              <Ionicons name="close" size={isTV ? 36 : 28} color="#fff" />
            </Focusable>
          </View>
          <Image source={{ uri: item.poster }} style={stylesTV.resumePoster} />
          <Text style={stylesTV.resumeItemTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={stylesTV.resumeProgressText}>Progreso guardado: {Math.round(progressPercent)}%</Text>
          <View style={stylesTV.resumeButtons}>
            <Focusable
              style={[stylesTV.resumeBtn, stylesTV.resumeBtnPrimary]}
              onPress={onResume}
              hasTVPreferredFocus={true}
            >
              <Ionicons name="play-forward" size={isTV ? 28 : 24} color="#fff" />
              <Text style={stylesTV.resumeBtnText}>Continuar (desde {Math.round(progressPercent)}%)</Text>
            </Focusable>
            <Focusable
              style={[stylesTV.resumeBtn, stylesTV.resumeBtnSecondary]}
              onPress={onRestart}
            >
              <Ionicons name="refresh" size={isTV ? 28 : 24} color="#fff" />
              <Text style={stylesTV.resumeBtnText}>Desde el principio</Text>
            </Focusable>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
});

// ============================================================
// COMPONENTE: PANTALLA DE PERFILES (FULL SCREEN)
// ============================================================
const ProfileScreen = memo(({
  profiles,
  onSelectProfile,
  onCreateProfile,
  onDeleteProfile,
}: {
  profiles: Profile[];
  onSelectProfile: (id: string) => void;
  onCreateProfile: (profile: Profile) => void;
  onDeleteProfile: (id: string) => void;
}) => {
  const [showCreate, setShowCreate] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  const avatars = ['👤', '👩', '🧑', '👨', '👧', '👦', '👩‍🦰', '🧔', '👴', '👵', '🤴', '👸', '🦸', '🦹', '🧙', '🧚', '🧛', '🧜', '🧝', '🧞', '🧟'];

  const handleCreate = async () => {
    if (!newProfileName.trim()) return;
    const newProfile: Profile = {
      id: `profile_${Date.now()}`,
      name: newProfileName.trim(),
      avatar: avatars[Math.floor(Math.random() * avatars.length)],
    };
    await onCreateProfile(newProfile);
    setNewProfileName('');
    setShowCreate(false);
  };

  if (showCreate) {
    return (
      <View style={stylesTV.profileFullScreen}>
        <LinearGradient colors={['#0a0a12', '#1a0a20']} style={StyleSheet.absoluteFill} />
        <View style={stylesTV.profileCreateFull}>
          <Text style={stylesTV.profileCreateTitleFull}>Crear perfil</Text>
          <TextInput
            style={stylesTV.profileInputFull}
            placeholder="Nombre del perfil"
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={newProfileName}
            onChangeText={setNewProfileName}
            autoFocus={!isTV}
            onSubmitEditing={handleCreate}
          />
          <View style={stylesTV.profileCreateActionsFull}>
            <Focusable style={[stylesTV.resumeBtn, stylesTV.resumeBtnPrimary]} onPress={handleCreate}>
              <Text style={stylesTV.resumeBtnText}>Crear</Text>
            </Focusable>
            <Focusable style={[stylesTV.resumeBtn, stylesTV.resumeBtnSecondary]} onPress={() => setShowCreate(false)}>
              <Text style={stylesTV.resumeBtnText}>Cancelar</Text>
            </Focusable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={stylesTV.profileFullScreen}>
      <LinearGradient colors={['#0a0a12', '#1a0a20']} style={StyleSheet.absoluteFill} />
      <View style={stylesTV.profileFullContent}>
        <Text style={stylesTV.profileFullTitle}>¿Quién está viendo?</Text>
        <View style={stylesTV.profileFullList}>
          {profiles.map((p) => (
            <Focusable
              key={p.id}
              style={stylesTV.profileFullItem}
              onPress={() => onSelectProfile(p.id)}
              hasTVPreferredFocus={p === profiles[0]}
              tvParallaxProperties={{ enabled: true, shiftDistanceX: 15, shiftDistanceY: 15, tiltAngle: 0.1, magnification: 1.1 }}
            >
              <View style={stylesTV.profileFullAvatarContainer}>
                <Text style={stylesTV.profileFullAvatar}>{p.avatar}</Text>
                {profiles.length > 1 && (
                  <TouchableOpacity
                    style={stylesTV.profileFullDelete}
                    onPress={() => onDeleteProfile(p.id)}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="close-circle" size={isTV ? 32 : 24} color="#ff1744" />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={stylesTV.profileFullName}>{p.name}</Text>
            </Focusable>
          ))}
          <Focusable style={stylesTV.profileFullAdd} onPress={() => setShowCreate(true)}>
            <View style={stylesTV.profileFullAddCircle}>
              <Ionicons name="add" size={isTV ? 60 : 40} color="#fff" />
            </View>
            <Text style={stylesTV.profileFullAddText}>Agregar perfil</Text>
          </Focusable>
        </View>
        <Text style={stylesTV.profileFullHint}>Selecciona un perfil para comenzar</Text>
      </View>
    </View>
  );
});

// ============================================================
// COMPONENTE: BÚSQUEDA GLOBAL
// ============================================================
const GlobalSearch = memo(({
  visible,
  onClose,
  movies,
  series,
  anime,
  doramas,
  channels,
  onPlayMedia,
  onSelectShow,
  onSelectChannel,
}: any) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const q = query.toLowerCase().trim();
    const allResults: any[] = [];

    movies.forEach((m: MediaItem) => {
      if (m.title.toLowerCase().includes(q)) {
        allResults.push({ ...m, _type: 'movie', _source: 'Película' });
      }
    });
    series.forEach((s: PlexShow) => {
      if (s.title.toLowerCase().includes(q)) {
        allResults.push({ ...s, _type: 'series', _source: 'Serie' });
      }
    });
    anime.forEach((s: PlexShow) => {
      if (s.title.toLowerCase().includes(q)) {
        allResults.push({ ...s, _type: 'anime', _source: 'Anime' });
      }
    });
    doramas.forEach((s: PlexShow) => {
      if (s.title.toLowerCase().includes(q)) {
        allResults.push({ ...s, _type: 'dorama', _source: 'Dorama' });
      }
    });
    channels.forEach((c: Canal) => {
      if (c.name.toLowerCase().includes(q)) {
        allResults.push({ ...c, _type: 'channel', _source: 'Canal TV' });
      }
    });

    setResults(allResults.slice(0, 50));
  }, [query, movies, series, anime, doramas, channels]);

  const renderItem = ({ item }: { item: any }) => {
    const isMedia = item._type === 'movie' || item._type === 'series' || item._type === 'anime' || item._type === 'dorama';
    const isChannel = item._type === 'channel';
    const poster = isMedia ? item.poster : item.logo || 'https://via.placeholder.com/500x750.png?text=Canal';

    return (
      <Focusable
        style={stylesTV.searchResultItem}
        onPress={() => {
          if (isChannel) {
            onSelectChannel(item);
            onClose();
          } else if (item._type === 'movie' && item.streamUrl) {
            onPlayMedia(item, 'movie', item.title, item.streamUrl, item.poster);
            onClose();
          } else if ((item._type === 'series' || item._type === 'anime' || item._type === 'dorama') && item.seasons) {
            onSelectShow(item);
            onClose();
          } else {
            Alert.alert('Info', 'Contenido no disponible para reproducción directa');
          }
        }}
      >
        <Image source={{ uri: poster }} style={stylesTV.searchResultPoster} />
        <View style={stylesTV.searchResultInfo}>
          <Text style={stylesTV.searchResultTitle} numberOfLines={2}>{item.title || item.name}</Text>
          <Text style={stylesTV.searchResultSource}>{item._source}</Text>
          {isMedia && item.year && <Text style={stylesTV.searchResultYear}>{item.year}</Text>}
          {isChannel && item.nowPlaying && <Text style={stylesTV.searchResultNow}>{item.nowPlaying}</Text>}
        </View>
      </Focusable>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={stylesTV.searchContainer}>
        <View style={stylesTV.searchHeader}>
          <Ionicons name="search" size={isTV ? 32 : 24} color="rgba(255,255,255,0.6)" />
          <TextInput
            style={stylesTV.searchInput}
            placeholder="Buscar películas, series, canales..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={query}
            onChangeText={setQuery}
            autoFocus={!isTV}
          />
          <Focusable onPress={onClose} style={stylesTV.closeOverlayBtn}>
            <Ionicons name="close" size={isTV ? 32 : 24} color="#fff" />
          </Focusable>
        </View>
        {query.trim() === '' ? (
          <View style={stylesTV.searchEmpty}>
            <Ionicons name="search-outline" size={isTV ? 80 : 60} color="rgba(255,255,255,0.2)" />
            <Text style={stylesTV.searchEmptyText}>Busca contenido en toda la plataforma</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={stylesTV.searchEmpty}>
            <Ionicons name="sad-outline" size={isTV ? 80 : 60} color="rgba(255,255,255,0.2)" />
            <Text style={stylesTV.searchEmptyText}>No se encontraron resultados para "{query}"</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item, index) => `${item.id || item._type}-${index}`}
            renderItem={renderItem}
            numColumns={isTV ? 3 : 2}
            contentContainerStyle={stylesTV.searchResultsList}
          />
        )}
      </View>
    </Modal>
  );
});

// ============================================================
// COMPONENTE: LISTA DE CANALES
// ============================================================
const ChannelList = memo(({
  channels,
  currentChannel,
  favorites,
  onSelectChannel,
  onToggleFavorite,
  onClose,
  isOverlay = false
}: any) => {
  const listRef = useRef<FlatList>(null);

  const renderChannel = ({ item, index }: { item: Canal; index: number }) => {
    const isActive = currentChannel?.id === item.id;
    const isFav = favorites.includes(item.id);

    return (
      <Focusable
        style={[
          stylesTV.channelItem,
          isActive && stylesTV.channelItemActive,
        ]}
        onPress={() => {
          onSelectChannel(item);
          if (isOverlay && onClose) onClose();
        }}
        onLongPress={() => {
          onToggleFavorite(item.id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }}
        hasTVPreferredFocus={index === 0 && !isOverlay}
      >
        <View style={stylesTV.channelLogoContainer}>
          {item.logo ? (
            <Image source={{ uri: item.logo }} style={stylesTV.channelLogo} />
          ) : (
            <Text style={stylesTV.channelLogoFallback}>{item.numero}</Text>
          )}
        </View>
        <View style={stylesTV.channelInfo}>
          <Text style={stylesTV.channelName} numberOfLines={1}>{item.name}</Text>
          {item.nowPlaying && <Text style={stylesTV.channelNow} numberOfLines={1}>{item.nowPlaying}</Text>}
        </View>
        {isActive && <View style={stylesTV.channelActiveIndicator}><Ionicons name="play" size={isTV ? 20 : 16} color="#ff1744" /></View>}
        {isFav && !isActive && <Ionicons name="star" size={isTV ? 22 : 18} color="#F5C842" style={{ marginLeft: 4 }} />}
      </Focusable>
    );
  };

  return (
    <View style={[stylesTV.channelListContainer, isOverlay && stylesTV.channelListOverlay]}>
      {isOverlay && (
        <View style={stylesTV.channelListHeader}>
          <Text style={stylesTV.rightTitle}>📺 CANALES</Text>
          <Focusable onPress={onClose} style={stylesTV.closeOverlayBtn}>
            <Ionicons name="close" size={isTV ? 32 : 28} color="#fff" />
          </Focusable>
        </View>
      )}
      <FlatList
        ref={listRef}
        data={channels}
        keyExtractor={(item: Canal) => item.id}
        renderItem={renderChannel}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: isTV ? 40 : 20 }}
      />
    </View>
  );
});

// ============================================================
// COMPONENTE: REPRODUCTOR EN MINIATURA (con botón recargar)
// ============================================================
const LivePlayerMini = memo(({
  url,
  channel,
  loading,
  onToggleFullscreen,
  onToggleChannelOverlay,
  fullscreen = false,
  sourceOptions = [],
  selectedSourceIndex = 0,
  onSelectSource,
  onRefreshStream,
}: any) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(false);
  const controlsAnim = useRef(new Animated.Value(0)).current;
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);

  const messages = [
    "📢 Aviso: Estamos mejorando la calidad del servicio.",
    "🚀 Día a día estamos trabajando para mejorar.",
    "🎬 Pronto más contenido exclusivo.",
    "📡 Disfruta de la mejor programación.",
    "💡 Sugerencias: escríbenos a soporte@nexustv.com",
    "🔥 No te pierdas los estrenos de esta semana.",
  ];
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % messages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const player = useVideoPlayer(url || '', (p) => {
    if (url) {
      p.loop = false;
      p.play();
      setIsPlaying(true);
    }
  }, [url]);

  useEffect(() => {
    const handleRenewal = (event: any) => {
      const { cacheKey, newStream } = event.detail;
      if (newStream && url !== newStream) {
        console.log('[PLAYER] Stream renovado, actualizando URL...');
        const currentTime = player.currentTime || 0;
        const wasPlaying = player.playing;
        player.replace(newStream);
        player.currentTime = currentTime;
        if (wasPlaying) player.play();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('streamRenewed', handleRenewal);
      return () => window.removeEventListener('streamRenewed', handleRenewal);
    }
  }, [player, url]);

  useEffect(() => {
    if (controlsVisible) {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => {
        setControlsVisible(false);
        Animated.timing(controlsAnim, { toValue: 0, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
      }, 4000);
    }
    return () => { if (hideTimeout.current) clearTimeout(hideTimeout.current); };
  }, [controlsVisible]);

  const showControls = () => {
    setControlsVisible(true);
    Animated.timing(controlsAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  };

  const togglePlay = () => {
    if (player.playing) { player.pause(); setIsPlaying(false); } else { player.play(); setIsPlaying(true); }
    showControls();
  };

  const showPlayer = !loading && url && url.startsWith('http');

  const windowHeight = Dimensions.get('window').height;
  const availableHeight = windowHeight - (isTV ? 80 : 60);
  const playerHeight = fullscreen ? '100%' : availableHeight * 0.65;
  const messagesHeight = fullscreen ? 0 : availableHeight * 0.35;

  return (
    <View style={stylesTV.liveContainer}>
      <View style={{ height: playerHeight, backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
        {showPlayer ? (
          <>
            <VideoView
              style={StyleSheet.absoluteFill}
              player={player}
              contentFit="fill"
              nativeControls={false}
              onTouchStart={showControls}
            />
            <Animated.View style={[stylesTV.miniControls, { opacity: controlsAnim }]} pointerEvents={controlsVisible ? 'box-none' : 'none'}>
              <LinearGradient colors={['rgba(0,0,0,0.8)', 'transparent', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
              <View style={stylesTV.miniTopBar}>
                <Text style={stylesTV.miniTitle} numberOfLines={1}>{channel?.name || 'TV en vivo'}</Text>
                <View style={stylesTV.miniActions}>
                  {sourceOptions.length > 1 && fullscreen && (
                    <Focusable onPress={() => setSourceModalVisible(true)} style={[stylesTV.miniBtn, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
                      <Ionicons name="radio-outline" size={isTV ? 30 : 24} color="#fff" />
                    </Focusable>
                  )}
                  <Focusable onPress={onRefreshStream} style={[stylesTV.miniBtn, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
                    <Ionicons name="refresh" size={isTV ? 30 : 24} color="#fff" />
                  </Focusable>
                  <Focusable onPress={onToggleFullscreen} style={[stylesTV.miniBtn, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
                    <Ionicons name={fullscreen ? "contract-outline" : "expand-outline"} size={isTV ? 30 : 24} color="#fff" />
                  </Focusable>
                  <Focusable onPress={onToggleChannelOverlay} style={[stylesTV.miniBtn, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
                    <Ionicons name="list" size={isTV ? 30 : 24} color="#fff" />
                  </Focusable>
                </View>
              </View>
              <View style={stylesTV.miniCenter}>
                <Focusable style={stylesTV.miniPlayBtn} onPress={togglePlay}>
                  <LinearGradient colors={['#ff1744', '#d50000']} style={stylesTV.miniPlayGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Ionicons name={isPlaying ? 'pause' : 'play'} size={isTV ? 48 : 36} color="#fff" />
                  </LinearGradient>
                </Focusable>
              </View>
            </Animated.View>
            <SourceSelectorModal
              visible={sourceModalVisible}
              options={sourceOptions}
              selectedIndex={selectedSourceIndex}
              onSelect={onSelectSource}
              onClose={() => setSourceModalVisible(false)}
            />
          </>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
            <ActivityIndicator size="large" color="#ff1744" />
            <Text style={stylesTV.loadingText}>Cargando señal...</Text>
          </View>
        )}
      </View>
      {!fullscreen && (
        <View style={stylesTV.messagesSection}>
          <View style={stylesTV.messagesContainer}>
            <Ionicons name="information-circle-outline" size={isTV ? 32 : 24} color="rgba(255,255,255,0.6)" style={stylesTV.messageIcon} />
            <Text style={stylesTV.messageText} key={currentMessageIndex}>
              {loading ? '🔄 Cargando señal...' : messages[currentMessageIndex]}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
});

// ============================================================
// COMPONENTE: HEADER SUPERIOR
// ============================================================
const AppHeader = memo(({
  onSettingsPress,
  onHistoryPress,
  onContinueWatchingPress,
  onSearchPress,
  onProfilePress,
  userName = 'Invitado',
  avatarUrl,
}: any) => {
  return (
    <LinearGradient
      colors={['rgba(20,10,30,0.95)', 'rgba(10,10,20,0.9)']}
      style={stylesTV.headerContainer}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
    >
      <View style={stylesTV.headerLeft}>
        <Focusable onPress={onProfilePress} style={stylesTV.avatarContainer}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={stylesTV.avatar} />
          ) : (
            <LinearGradient colors={['#ff1744', '#d50000']} style={stylesTV.avatarPlaceholder}>
              <Ionicons name="person" size={isTV ? 32 : 24} color="#fff" />
            </LinearGradient>
          )}
        </Focusable>
        <Text style={stylesTV.userName}>{userName}</Text>
      </View>

      <View style={stylesTV.headerRight}>
        <Focusable style={[stylesTV.headerBtn, stylesTV.headerBtnPrimary]} onPress={onSearchPress}>
          <Ionicons name="search" size={isTV ? 28 : 24} color="#fff" />
          <Text style={stylesTV.headerBtnText}>Buscar</Text>
        </Focusable>
        <Focusable style={[stylesTV.headerBtn, stylesTV.headerBtnPrimary]} onPress={onContinueWatchingPress}>
          <Ionicons name="time-outline" size={isTV ? 28 : 24} color="#fff" />
          <Text style={stylesTV.headerBtnText}>Continuar</Text>
        </Focusable>
        <Focusable style={[stylesTV.headerBtn, stylesTV.headerBtnSecondary]} onPress={onHistoryPress}>
          <Ionicons name="calendar-outline" size={isTV ? 28 : 24} color="#fff" />
          <Text style={stylesTV.headerBtnText}>Historial</Text>
        </Focusable>
        <Focusable style={[stylesTV.headerBtn, stylesTV.headerBtnSecondary]} onPress={onSettingsPress}>
          <Ionicons name="settings-outline" size={isTV ? 28 : 24} color="#fff" />
          <Text style={stylesTV.headerBtnText}>Ajustes</Text>
        </Focusable>
      </View>
    </LinearGradient>
  );
});

// ============================================================
// VISTAS: CONTINUAR VIENDO, HISTORIAL, AJUSTES
// ============================================================
const ContinueWatchingView = memo(({ items, onPlay }: any) => {
  const renderItem = ({ item, index }: { item: ContinueWatchingItem; index: number }) => {
    const progressPercent = item.duration > 0 ? (item.progress / item.duration) * 100 : 0;
    const isWatched = progressPercent > 90;
    return (
      <Focusable
        style={stylesTV.gridItem}
        onPress={() => onPlay(item)}
        tvParallaxProperties={{ enabled: true, shiftDistanceX: 15, shiftDistanceY: 15, tiltAngle: 0.1, magnification: 1.1 }}
        hasTVPreferredFocus={index === 0}
      >
        <View style={stylesTV.gridPosterContainer}>
          <Image source={{ uri: item.poster }} style={stylesTV.gridPoster} />
          <View style={[stylesTV.continueProgressBar, { position: 'absolute', bottom: 0, left: 0, right: 0, height: isTV ? 8 : 6, backgroundColor: 'rgba(0,0,0,0.7)' }]}>
            <View style={[stylesTV.continueProgressFill, { width: `${Math.min(progressPercent, 100)}%` }]} />
          </View>
          {isWatched && (
            <View style={[stylesTV.gridRating, { top: 8, right: 8, bottom: undefined }]}>
              <Text style={{ color: '#4CAF50', fontSize: isTV ? 16 : 12, fontWeight: '700' }}>✓ Visto</Text>
            </View>
          )}
        </View>
        <Text style={stylesTV.gridTitle} numberOfLines={2}>{item.title}</Text>
      </Focusable>
    );
  };

  return (
    <View style={stylesTV.gridContainer}>
      <Text style={stylesTV.gridSectionTitle}>⏳ Continuar viendo</Text>
      {items.length === 0 ? (
        <View style={stylesTV.centerLoading}>
          <Ionicons name="tv-outline" size={isTV ? 80 : 60} color="rgba(255,255,255,0.3)" />
          <Text style={stylesTV.loadingText}>No hay contenido en "Continuar viendo"</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          numColumns={isTV ? 6 : 4}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: isTV ? 40 : 20 }}
        />
      )}
    </View>
  );
});

const HistoryView = memo(({ items, onPlay }: any) => {
  const renderItem = ({ item, index }: { item: ContinueWatchingItem; index: number }) => {
    const progressPercent = item.duration > 0 ? (item.progress / item.duration) * 100 : 0;
    return (
      <Focusable
        style={stylesTV.gridItem}
        onPress={() => onPlay(item)}
        tvParallaxProperties={{ enabled: true, shiftDistanceX: 15, shiftDistanceY: 15, tiltAngle: 0.1, magnification: 1.1 }}
        hasTVPreferredFocus={index === 0}
      >
        <View style={stylesTV.gridPosterContainer}>
          <Image source={{ uri: item.poster }} style={stylesTV.gridPoster} />
          <View style={[stylesTV.continueProgressBar, { position: 'absolute', bottom: 0, left: 0, right: 0, height: isTV ? 8 : 6, backgroundColor: 'rgba(0,0,0,0.7)' }]}>
            <View style={[stylesTV.continueProgressFill, { width: `${Math.min(progressPercent, 100)}%` }]} />
          </View>
        </View>
        <Text style={stylesTV.gridTitle} numberOfLines={2}>{item.title}</Text>
      </Focusable>
    );
  };

  return (
    <View style={stylesTV.gridContainer}>
      <Text style={stylesTV.gridSectionTitle}>📜 Historial</Text>
      {items.length === 0 ? (
        <View style={stylesTV.centerLoading}>
          <Ionicons name="calendar-outline" size={isTV ? 80 : 60} color="rgba(255,255,255,0.3)" />
          <Text style={stylesTV.loadingText}>No hay historial de reproducción</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          numColumns={isTV ? 6 : 4}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: isTV ? 40 : 20 }}
        />
      )}
    </View>
  );
});

const SettingsView = memo(() => {
  const [deviceInfo, setDeviceInfo] = useState<any>({});
  const [forceProxy, setForceProxy] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      setDeviceInfo({
        appVersion: Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0',
        brand: Device.brand || 'Desconocido',
        mac: Device.macAddress || 'No disponible',
        webviewVersion: Platform.Version || 'Desconocido',
      });
      const saved = await AsyncStorage.getItem('forceProxy');
      setForceProxy(saved === 'true');
    };
    loadSettings();
  }, []);

  const toggleProxy = async () => {
    const newVal = !forceProxy;
    setForceProxy(newVal);
    await AsyncStorage.setItem('forceProxy', JSON.stringify(newVal));
    Alert.alert('Modo proxy', newVal ? 'Activado' : 'Desactivado');
  };

  const openWhatsApp = () => {
    const url = `https://wa.me/5492995958958?text=Hola%20NEXUS%20TV%2C%20tengo%20una%20consulta`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'No se pudo abrir WhatsApp'));
  };

  return (
    <View style={stylesTV.settingsContainer}>
      <Text style={stylesTV.gridSectionTitle}>⚙️ Ajustes</Text>
      <View style={stylesTV.settingsCard}>
        <View style={stylesTV.settingsItem}>
          <Ionicons name="information-circle-outline" size={isTV ? 36 : 28} color="#ff1744" />
          <Text style={stylesTV.settingsLabel}>Versión de la app:</Text>
          <Text style={stylesTV.settingsValue}>{deviceInfo.appVersion}</Text>
        </View>
        <View style={stylesTV.settingsItem}>
          <Ionicons name="wifi-outline" size={isTV ? 36 : 28} color="#ff1744" />
          <Text style={stylesTV.settingsLabel}>Dirección MAC:</Text>
          <Text style={stylesTV.settingsValue}>{deviceInfo.mac}</Text>
        </View>
        <View style={stylesTV.settingsItem}>
          <Ionicons name="phone-portrait-outline" size={isTV ? 36 : 28} color="#ff1744" />
          <Text style={stylesTV.settingsLabel}>Android API:</Text>
          <Text style={stylesTV.settingsValue}>{deviceInfo.webviewVersion}</Text>
        </View>
        <View style={stylesTV.settingsItem}>
          <Ionicons name="cloud-outline" size={isTV ? 36 : 28} color="#ff1744" />
          <Text style={stylesTV.settingsLabel}>Forzar proxy (para MXQ)</Text>
          <Switch
            value={forceProxy}
            onValueChange={toggleProxy}
            trackColor={{ false: '#767577', true: '#ff1744' }}
            thumbColor={forceProxy ? '#f4f3f4' : '#f4f3f4'}
          />
        </View>
        <TouchableOpacity style={stylesTV.settingsWhatsAppBtn} onPress={openWhatsApp}>
          <Ionicons name="logo-whatsapp" size={isTV ? 36 : 28} color="#25D366" />
          <Text style={stylesTV.settingsWhatsAppText}>Contactar por WhatsApp</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ============================================================
// REPRODUCTOR POR WEBVIEW (fallback)
// ============================================================
const WebViewPlayer = memo(({ url, onClose, title }: { url: string; onClose: () => void; title?: string }) => {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    console.log('[WebViewPlayer] Abriendo URL:', url);
    lockLandscape();
    return () => {};
  }, []);

  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
      body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
      #video-container { width: 100vw; height: 100vh; background: #000; }
      video { width: 100%; height: 100%; object-fit: contain; background: #000; }
      #error-msg { color: #ff1744; font-family: sans-serif; text-align: center; padding: 20px; display: none; }
    </style>
  </head>
  <body>
    <div id="video-container">
      <video id="video" controls autoplay playsinline></video>
      <div id="error-msg">Error al cargar el stream. Intente recargar.</div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@0.14.17/dist/hls.min.js"></script>
    <script>
      (function() {
        var video = document.getElementById('video');
        var errorDiv = document.getElementById('error-msg');
        var streamUrl = '${url}';
        
        function loadStream() {
          if (Hls.isSupported()) {
            var hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
              fragLoadingMaxRetry: 10,
              manifestLoadingMaxRetry: 10,
              levelLoadingMaxRetry: 10,
              maxBufferLength: 30,
              maxMaxBufferLength: 60,
            });
            hls.loadSource(streamUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
              video.play().catch(function(e) { console.log('Autoplay blocked', e); });
            });
            hls.on(Hls.Events.ERROR, function(event, data) {
              if (data.fatal) {
                errorDiv.style.display = 'block';
                console.log('HLS Fatal Error', data);
              }
            });
            window.__hls = hls;
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = streamUrl;
            video.addEventListener('loadedmetadata', function() { video.play(); });
          } else {
            errorDiv.style.display = 'block';
            errorDiv.innerText = 'Reproductor no soportado en este dispositivo.';
          }
        }

        if (document.readyState === 'complete') {
          loadStream();
        } else {
          window.addEventListener('load', loadStream);
        }

        setTimeout(function() {
          if (!window.__hls && video.src === '') {
            video.src = streamUrl;
            video.play();
          }
        }, 3000);
      })();
    </script>
  </body>
  </html>
  `;

  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <StatusBar hidden />
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Focusable style={stylesTV.modalCloseBtn} onPress={onClose}>
          <Ionicons name="close" size={isTV ? 40 : 32} color="#fff" />
        </Focusable>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          style={{ flex: 1, backgroundColor: '#000' }}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          userAgent="Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36"
          onError={(e) => console.log('[WebViewPlayer] Error:', e.nativeEvent)}
        />
      </View>
    </Modal>
  );
});

// ============================================================
// REPRODUCTOR MODAL MEJORADO (con renovación automática y recarga)
// ============================================================
const ReproductorMejorado = memo(({
  url,
  onClose,
  title,
  id,
  poster,
  type = 'movie',
  showId,
  showName,
  episodeCode,
  sourceOptions = [],
  selectedSourceIndex = 0,
  onSelectSource,
  initialTime = 0,
  onRefreshStream,
}: any) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [savedProgress, setSavedProgress] = useState(0);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [hasSetInitialTime, setHasSetInitialTime] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(url);

  useKeepAwake();

  const controlsAnim = useRef(new Animated.Value(1)).current;
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const player = useVideoPlayer(currentUrl, (p) => {
    p.loop = false;
    p.play();
    setIsPlaying(true);
    if (initialTime > 0 && !hasSetInitialTime) {
      p.currentTime = initialTime;
      setCurrentTime(initialTime);
      setHasSetInitialTime(true);
    }
  }, [currentUrl]);

  useEffect(() => {
    const handleRenewal = (event: any) => {
      const { cacheKey, newStream } = event.detail;
      if (newStream && currentUrl !== newStream) {
        console.log('[PLAYER MODAL] Stream renovado, actualizando URL...');
        const time = player.currentTime || 0;
        const wasPlaying = player.playing;
        setCurrentUrl(newStream);
        setTimeout(() => {
          player.currentTime = time;
          if (wasPlaying) player.play();
        }, 100);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('streamRenewed', handleRenewal);
      return () => window.removeEventListener('streamRenewed', handleRenewal);
    }
  }, [player, currentUrl]);

  useEffect(() => {
    if (!player || !id) return;
    saveIntervalRef.current = setInterval(() => {
      const current = player.currentTime || 0;
      const dur = (player as any).duration || 0;
      if (dur > 0 && current > 5 && Math.abs(current - savedProgress) > 5) {
        setSavedProgress(current);
        saveContinueWatching({
          id: id,
          title: title,
          poster: poster,
          progress: current,
          duration: dur,
          type: type,
          streamUrl: currentUrl,
          showId: showId,
          showName: showName,
          episodeCode: episodeCode,
          watchedAt: Date.now(),
        });
      }
    }, 5000);
    return () => {
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
    };
  }, [player, id, savedProgress, currentUrl]);

  const handleClose = () => {
    console.log('[PLAYER] Cerrando reproductor');
    const current = player.currentTime || 0;
    const dur = (player as any).duration || 0;
    if (dur > 0 && current > 5 && id) {
      saveContinueWatching({
        id: id,
        title: title,
        poster: poster,
        progress: current,
        duration: dur,
        type: type,
        streamUrl: currentUrl,
        showId: showId,
        showName: showName,
        episodeCode: episodeCode,
        watchedAt: Date.now(),
      });
    }
    try { if (player && typeof player.pause === 'function') player.pause(); } catch (e) {}
    onClose();
  };

  useEffect(() => {
    if (controlsVisible) {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => {
        setControlsVisible(false);
        Animated.timing(controlsAnim, { toValue: 0, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
      }, 3000);
    }
    return () => { if (hideTimeout.current) clearTimeout(hideTimeout.current); };
  }, [controlsVisible]);

  const showControls = () => {
    setControlsVisible(true);
    Animated.timing(controlsAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  };

  const togglePlay = () => {
    if (player.playing) { player.pause(); setIsPlaying(false); } else { player.play(); setIsPlaying(true); }
    showControls();
  };

  const seek = (seconds: number) => {
    const newTime = Math.max(0, Math.min(duration, (player.currentTime || 0) + seconds));
    player.currentTime = newTime;
    setCurrentTime(newTime);
    showControls();
  };

  const handleSeekBarPress = (event: any) => {
    const { locationX, layout } = event.nativeEvent;
    const progress = Math.max(0, Math.min(1, locationX / layout.width));
    const newTime = progress * duration;
    player.currentTime = newTime;
    setCurrentTime(newTime);
    showControls();
  };

  useEffect(() => {
    const sub1 = player.addListener('playingChange', (p: any) => {
      const playing = p?.isPlaying ?? p;
      setIsPlaying(!!playing);
      if (playing) setLoading(false);
    });
    const sub2 = player.addListener('statusChange', (p: any) => {
      if (p?.error) { 
        setError('Error en la reproducción'); 
        setLoading(false); 
      }
    });
    return () => { sub1.remove(); sub2.remove(); };
  }, [player]);

  useEffect(() => {
    const interval = setInterval(() => {
      const ct = player.currentTime || 0;
      const dur = (player as any).duration || 0;
      setCurrentTime(ct);
      setDuration(dur);
    }, 200);
    return () => clearInterval(interval);
  }, [player]);

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  useEffect(() => {
    lockLandscape();
    return () => {};
  }, []);

  if (error) {
    return (
      <Modal visible animationType="fade" statusBarTranslucent>
        <View style={stylesTV.modalFullscreen}>
          <Focusable style={stylesTV.modalCloseBtn} onPress={handleClose}>
            <Ionicons name="close" size={isTV ? 40 : 32} color="#fff" />
          </Focusable>
          <View style={stylesTV.modalError}><Ionicons name="alert-circle-outline" size={isTV ? 80 : 60} color="#ff1744" /><Text style={stylesTV.errorText}>{error}</Text></View>
          <Focusable style={[stylesTV.resumeBtn, stylesTV.resumeBtnPrimary]} onPress={onRefreshStream}>
            <Ionicons name="refresh" size={28} color="#fff" />
            <Text style={stylesTV.resumeBtnText}>Reintentar</Text>
          </Focusable>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View style={stylesTV.modalFullscreen}>
        <Focusable style={stylesTV.modalCloseBtn} onPress={handleClose}>
          <Ionicons name="close" size={isTV ? 40 : 32} color="#fff" />
        </Focusable>
        {loading && <View style={stylesTV.modalLoading}><ActivityIndicator size="large" color="#ff1744" /><Text style={stylesTV.loadingText}>Cargando...</Text></View>}
        <VideoView style={StyleSheet.absoluteFill} player={player} contentFit="contain" nativeControls={false} onTouchStart={showControls} />
        <Animated.View style={[stylesTV.modalControls, { opacity: controlsAnim }]} pointerEvents={controlsVisible ? 'box-none' : 'none'}>
          <LinearGradient colors={['rgba(0,0,0,0.8)', 'transparent', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={stylesTV.modalControlTop}>
            <Text style={stylesTV.playerTitle} numberOfLines={1}>{title || 'Reproduciendo'}</Text>
            <View style={{ flexDirection: 'row' }}>
              {sourceOptions.length > 1 && (
                <Focusable onPress={() => setSourceModalVisible(true)} style={stylesTV.sourceBtn}>
                  <Ionicons name="radio-outline" size={isTV ? 34 : 28} color="#fff" />
                </Focusable>
              )}
              <Focusable onPress={onRefreshStream} style={stylesTV.sourceBtn}>
                <Ionicons name="refresh" size={isTV ? 34 : 28} color="#fff" />
              </Focusable>
            </View>
          </View>
          <View style={stylesTV.modalControlCenter}>
            <Focusable style={stylesTV.controlBtn} onPress={() => seek(-10)}>
              <Ionicons name="play-back" size={isTV ? 44 : 36} color="#fff" />
              <Text style={stylesTV.controlLabel}>10</Text>
            </Focusable>
            <Focusable style={stylesTV.modalPlayBtn} onPress={togglePlay}>
              <LinearGradient colors={['#ff1744', '#d50000']} style={stylesTV.modalPlayGradient}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={isTV ? 56 : 48} color="#fff" />
              </LinearGradient>
            </Focusable>
            <Focusable style={stylesTV.controlBtn} onPress={() => seek(10)}>
              <Ionicons name="play-forward" size={isTV ? 44 : 36} color="#fff" />
              <Text style={stylesTV.controlLabel}>10</Text>
            </Focusable>
          </View>
          {duration > 0 && <View style={stylesTV.modalControlBottom}>
            <Text style={stylesTV.timeText}>{formatTime(currentTime)}</Text>
            <View style={stylesTV.progressTrack}><View style={stylesTV.progressBg} /><View style={[stylesTV.progressFill, { width: `${progress * 100}%`, backgroundColor: '#ff1744' }]} /><View style={[stylesTV.progressThumb, { left: `${progress * 100}%` }]} /><TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleSeekBarPress} /></View>
            <Text style={stylesTV.timeText}>{formatTime(duration)}</Text>
          </View>}
        </Animated.View>
        <SourceSelectorModal
          visible={sourceModalVisible}
          options={sourceOptions}
          selectedIndex={selectedSourceIndex}
          onSelect={onSelectSource}
          onClose={() => setSourceModalVisible(false)}
        />
      </View>
    </Modal>
  );
});

// ============================================================
// COMPONENTES DE GRID (Películas y Series)
// ============================================================
const MoviesGrid = memo(({ items, loading, onRefresh, onPlay }: any) => {
  const [busqueda, setBusqueda] = useState('');
  const filtered = items.filter((i: MediaItem) => i.title.toLowerCase().includes(busqueda.toLowerCase()));

  const renderMovie = ({ item, index }: { item: MediaItem; index: number }) => (
    <Focusable
      style={stylesTV.gridItem}
      onPress={() => onPlay(item)}
      tvParallaxProperties={{ enabled: true, shiftDistanceX: 15, shiftDistanceY: 15, tiltAngle: 0.1, magnification: 1.1 }}
      hasTVPreferredFocus={index === 0}
    >
      <View style={stylesTV.gridPosterContainer}>
        <Image source={{ uri: item.poster }} style={stylesTV.gridPoster} />
        {item.rating && (
          <View style={stylesTV.gridRating}>
            <Ionicons name="star" size={isTV ? 18 : 14} color="#F5C842" />
            <Text style={stylesTV.gridRatingText}>{item.rating}</Text>
          </View>
        )}
      </View>
      <Text style={stylesTV.gridTitle} numberOfLines={2}>{item.title}</Text>
      {item.year && <Text style={stylesTV.gridYear}>{item.year}</Text>}
    </Focusable>
  );

  return (
    <View style={stylesTV.gridContainer}>
      <View style={stylesTV.gridSearch}>
        <Ionicons name="search" size={isTV ? 32 : 24} color="rgba(255,255,255,0.5)" />
        <TextInput
          style={stylesTV.gridSearchInput}
          placeholder="Buscar películas..."
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={busqueda}
          onChangeText={setBusqueda}
        />
      </View>
      {loading ? (
        <View style={stylesTV.centerLoading}><ActivityIndicator size="large" color="#ff1744" /><Text style={stylesTV.loadingText}>Cargando películas...</Text></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i: MediaItem) => i.id}
          numColumns={isTV ? 6 : 4}
          renderItem={renderMovie}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#ff1744" colors={['#ff1744']} />}
          contentContainerStyle={{ paddingBottom: isTV ? 40 : 20 }}
        />
      )}
    </View>
  );
});

const SeriesGrid = memo(({ shows, loading, onRefresh, onSelectShow, title }: any) => {
  const [busqueda, setBusqueda] = useState('');
  const filtered = shows.filter((s: PlexShow) => s.title.toLowerCase().includes(busqueda.toLowerCase()));

  const renderShow = ({ item, index }: { item: PlexShow; index: number }) => (
    <Focusable
      style={stylesTV.gridItem}
      onPress={() => onSelectShow(item)}
      tvParallaxProperties={{ enabled: true, shiftDistanceX: 15, shiftDistanceY: 15, tiltAngle: 0.1, magnification: 1.1 }}
      hasTVPreferredFocus={index === 0}
    >
      <View style={stylesTV.gridPosterContainer}>
        <Image source={{ uri: item.poster }} style={stylesTV.gridPoster} />
        {item.rating && (
          <View style={stylesTV.gridRating}>
            <Ionicons name="star" size={isTV ? 18 : 14} color="#F5C842" />
            <Text style={stylesTV.gridRatingText}>{item.rating}</Text>
          </View>
        )}
      </View>
      <Text style={stylesTV.gridTitle} numberOfLines={2}>{item.title}</Text>
      {item.year && <Text style={stylesTV.gridYear}>{item.year}</Text>}
    </Focusable>
  );

  return (
    <View style={stylesTV.gridContainer}>
      <Text style={stylesTV.gridSectionTitle}>{title || 'Series'}</Text>
      <View style={stylesTV.gridSearch}>
        <Ionicons name="search" size={isTV ? 32 : 24} color="rgba(255,255,255,0.5)" />
        <TextInput
          style={stylesTV.gridSearchInput}
          placeholder="Buscar series..."
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={busqueda}
          onChangeText={setBusqueda}
        />
      </View>
      {loading ? (
        <View style={stylesTV.centerLoading}><ActivityIndicator size="large" color="#ff1744" /><Text style={stylesTV.loadingText}>Cargando series...</Text></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item: PlexShow) => item.id}
          numColumns={isTV ? 6 : 4}
          renderItem={renderShow}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#ff1744" colors={['#ff1744']} />}
          contentContainerStyle={{ paddingBottom: isTV ? 40 : 20 }}
        />
      )}
    </View>
  );
});

// ============================================================
// DETALLE DE SERIE
// ============================================================
const SeriesDetail = memo(({ show, onBack, onPlayEpisode }: { show: PlexShow; onBack: () => void; onPlayEpisode: (ep: PlexEpisode) => void }) => {
  const renderEpisode = ({ item: ep, index }: { item: PlexEpisode; index: number }) => (
    <Focusable
      style={stylesTV.detailEpisodeRow}
      onPress={() => onPlayEpisode(ep)}
      hasTVPreferredFocus={index === 0}
    >
      <View style={stylesTV.detailEpisodeCodeBox}>
        <Text style={stylesTV.detailEpisodeCode}>{ep.code}</Text>
      </View>
      <Text style={stylesTV.detailEpisodeTitle} numberOfLines={1}>{ep.title}</Text>
      <Ionicons name="play-circle-outline" size={isTV ? 34 : 28} color="rgba(255,255,255,0.6)" />
    </Focusable>
  );

  return (
    <View style={stylesTV.gridContainer}>
      <Focusable style={stylesTV.detailBackBtn} onPress={onBack}>
        <Ionicons name="chevron-back" size={isTV ? 34 : 28} color="#fff" />
        <Text style={stylesTV.detailBackText} numberOfLines={1}>{show.title}</Text>
      </Focusable>

      {show.overview ? (
        <Text style={stylesTV.detailOverview} numberOfLines={3}>{show.overview}</Text>
      ) : null}

      {(!show.seasons || show.seasons.length === 0) ? (
        <View style={stylesTV.centerLoading}>
          <Text style={stylesTV.loadingText}>No se encontraron episodios para esta serie.</Text>
        </View>
      ) : (
        <FlatList
          data={show.seasons}
          keyExtractor={(s: PlexSeason) => String(s.number)}
          renderItem={({ item: season }) => (
            <View style={stylesTV.detailSeasonBlock}>
              <Text style={stylesTV.gridSectionTitle}>{season.label}</Text>
              {season.episodes.map((ep, idx) => renderEpisode({ item: ep, index: idx }))}
            </View>
          )}
          contentContainerStyle={{ paddingBottom: isTV ? 40 : 30 }}
        />
      )}
    </View>
  );
});

// ============================================================
// COMPONENTE PRINCIPAL AppTV
// ============================================================
export default function AppTV() {
  const [selectedMenu, setSelectedMenu] = useState('TV');
  const [listaCanales, setListaCanales] = useState<Canal[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [currentChannel, setCurrentChannel] = useState<Canal | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  const [isLiveFullscreen, setIsLiveFullscreen] = useState(false);
  const [showChannelOverlay, setShowChannelOverlay] = useState(false);

  const [driveMovies, setDriveMovies] = useState<MediaItem[]>([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [plexShows, setPlexShows] = useState<PlexShow[]>([]);
  const [loadingPlex, setLoadingPlex] = useState(false);
  const [animeShows, setAnimeShows] = useState<PlexShow[]>([]);
  const [loadingAnime, setLoadingAnime] = useState(false);
  const [doramasShows, setDoramasShows] = useState<PlexShow[]>([]);
  const [loadingDoramas, setLoadingDoramas] = useState(false);
  const [selectedShow, setSelectedShow] = useState<PlexShow | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'detail'>('grid');

  const [continueWatchingItems, setContinueWatchingItems] = useState<ContinueWatchingItem[]>([]);

  // Perfiles
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [showProfileScreen, setShowProfileScreen] = useState(true);

  // Búsqueda
  const [searchVisible, setSearchVisible] = useState(false);

  // Reproductor
  const [playerVisible, setPlayerVisible] = useState(false);
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [playerTitle, setPlayerTitle] = useState<string>('');
  const [playerId, setPlayerId] = useState<string>('');
  const [playerPoster, setPlayerPoster] = useState<string>('');
  const [playerType, setPlayerType] = useState<string>('movie');
  const [playerShowId, setPlayerShowId] = useState<string>('');
  const [playerShowName, setPlayerShowName] = useState<string>('');
  const [playerEpisodeCode, setPlayerEpisodeCode] = useState<string>('');
  const [playerInitialTime, setPlayerInitialTime] = useState<number>(0);

  const [sourceOptions, setSourceOptions] = useState<{ label: string; url: string }[]>([]);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number>(0);

  const [resumeDialogVisible, setResumeDialogVisible] = useState(false);
  const [resumeItem, setResumeItem] = useState<ContinueWatchingItem | null>(null);

  const driveMoviesLoaded = useRef(false);
  const plexLoaded = useRef(false);
  const animeLoaded = useRef(false);
  const doramasLoaded = useRef(false);
  const extractorResolve = useRef<((stream: string | null) => void) | null>(null);
  const [extractorUrl, setExtractorUrl] = useState<string | null>(null);
  const isLegacyTvBox = isLegacyWebView;
  useKeepAwake();

  const SLUG_MAP: Record<string, string> = {
    'dsports': 'directv-sports',
    'dsports2': 'directv-sports-2',
    'dsportsplus': 'directv-sports-plus',
    'tycsports': 'tyc-sports',
    'tntsports': 'tnt-sports',
    'espnpremium': 'espn-premium',
    'espn': 'espn-1',
    'espn2': 'espn-2',
    'espn3': 'espn-3',
    'espn4': 'espn-4',
    'espn5': 'espn-5',
    'espn6': 'espn-6',
    'telefe': 'telefe',
    'tntseries': 'tnt-series',
    'disneychannel': 'disney-channel',
    'tnt': 'tnt',
    'warnerchannel': 'warner-channel',
    'fx': 'fx',
    'comedycentral': 'comedy-central',
    'golden': 'golden',
    'goldenedge': 'golden-edge',
    'discoveryscience': 'discovery-sci',
    'universalpremiere': 'universal-premiere',
    'animalplanet': 'animal-planet',
    'discoveryturbo': 'discovery-turbo',
    'tntnovelas': 'tnt-novelas',
  };

  function getSourceOptionsForSlug(embedSlug: string): { label: string; url: string }[] {
    const slug = SLUG_MAP[embedSlug] || embedSlug;
    const options: { label: string; url: string }[] = [];
    if (embedSlug) {
      const protocol = isLegacyWebView ? 'http' : 'https';
      options.push({ label: 'Regionales', url: `${protocol}://regionales.saohgdasregions.fun/stream.php?canal=${embedSlug}` });
      options.push({ label: 'StreamHDX', url: `${protocol}://streamhdx.com/live1.php?stream=${embedSlug}` });
      options.push({ label: 'Gambeta', url: `${protocol}://gambeta.vip/canal/${slug}` });
      options.push({ label: 'LibrePelota', url: `${protocol}://librepelota.su/es/${embedSlug}/` });
      if (isLegacyWebView) {
        options.push({ label: 'Regionales (HTTPS)', url: `https://regionales.saohgdasregions.fun/stream.php?canal=${embedSlug}` });
        options.push({ label: 'StreamHDX (HTTPS)', url: `https://streamhdx.com/live1.php?stream=${embedSlug}` });
      }
    }
    return options;
  }

  const extraerConWebView = useCallback((url: string): Promise<string | null> => {
    if (isLegacyWebView) {
      console.log('[EXTRACTOR] WebView legacy, skip');
      return Promise.resolve(null);
    }
    console.log('[EXTRACTOR] Abriendo WebView para', url);
    return new Promise((resolve) => {
      extractorResolve.current = resolve;
      setExtractorUrl(url);
      setTimeout(() => {
        if (extractorResolve.current) {
          console.log('[EXTRACTOR] Timeout para', url);
          extractorResolve.current(null);
          extractorResolve.current = null;
          setExtractorUrl(null);
        }
      }, 20000);
    });
  }, []);

  useEffect(() => {
    extraerConWebViewRef = extraerConWebView;
  }, [extraerConWebView]);

  const cargarListaM3U = useCallback(async () => {
    console.log('[M3U] Cargando lista...');
    setLoadingChannels(true);
    try {
      const res = await fetch(`${M3U_URL}?t=${Date.now()}`, { cache: 'no-store' });
      const txt = await res.text();
      const lineas = txt.split('\n');
      const parsed: Canal[] = [];
      let info = { name: '', logo: '', category: 'General' };
      let idx = 20;
      lineas.forEach(l => {
        const lim = l.trim();
        if (lim.startsWith('#EXTINF:')) {
          const parts = lim.split(',');
          info.name = parts[parts.length - 1].trim() || 'Canal';
          info.logo = lim.match(/tvg-logo="([^"]+)"/i)?.[1] ?? '';
          info.category = lim.match(/group-title="([^"]+)"/i)?.[1] ?? 'General';
        } else if (lim.startsWith('http')) {
          let url = convertirMpdAHls(lim);
          const slug = extractEmbedSlug(url);
          parsed.push({
            id: String(3000 + idx),
            numero: idx++,
            name: info.name,
            logo: info.logo,
            category: info.category,
            url,
            ...(slug ? { embedSlug: slug } : {}),
          });
          info = { name: '', logo: '', category: 'General' };
        }
      });
      setListaCanales([...CANALES_MANUALES, ...parsed]);
      if (parsed.length > 0) {
        const firstChannel = [...CANALES_MANUALES, ...parsed][0];
        setCurrentChannel(firstChannel);
        playChannel(firstChannel);
      }
    } catch (e) {
      setListaCanales(CANALES_MANUALES);
      if (CANALES_MANUALES.length > 0) {
        setCurrentChannel(CANALES_MANUALES[0]);
        playChannel(CANALES_MANUALES[0]);
      }
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  const cargarDriveMovies = useCallback(async (force = false) => {
    if (force) driveMoviesLoaded.current = false;
    if (loadingDrive || driveMoviesLoaded.current) return;
    setLoadingDrive(true);
    try {
      const items = await cargarCarpetaDrive(DRIVE_FOLDER_PELICULAS, 'movie', 'driveMoviesCacheTV');
      setDriveMovies(items);
      driveMoviesLoaded.current = true;
    } catch (e) { console.log(e); } finally { setLoadingDrive(false); }
  }, [loadingDrive]);

  const cargarPlex = useCallback(async (force = false) => {
    if (force) plexLoaded.current = false;
    if (loadingPlex || plexLoaded.current) return;
    if (!force) {
      try {
        const cached = await AsyncStorage.getItem('driveSeriesShowsCacheTV');
        if (cached) {
          setPlexShows(JSON.parse(cached));
          plexLoaded.current = true;
          return;
        }
      } catch (e) {}
    }
    setLoadingPlex(true);
    try {
      const shows = await cargarSeriesPlex(DRIVE_FOLDER_SERIES, 'driveSeriesCacheTV');
      setPlexShows(shows);
      await AsyncStorage.setItem('driveSeriesShowsCacheTV', JSON.stringify(shows));
      plexLoaded.current = true;
    } catch (e) { console.log(e); } finally { setLoadingPlex(false); }
  }, [loadingPlex]);

  const cargarAnime = useCallback(async (force = false) => {
    if (force) animeLoaded.current = false;
    if (loadingAnime || animeLoaded.current) return;
    if (!force) {
      try {
        const cached = await AsyncStorage.getItem('driveAnimeShowsCacheTV');
        if (cached) {
          setAnimeShows(JSON.parse(cached));
          animeLoaded.current = true;
          return;
        }
      } catch (e) {}
    }
    setLoadingAnime(true);
    try {
      const shows = await cargarSeriesPlex(DRIVE_FOLDER_ANIME, 'driveAnimeCacheTV');
      setAnimeShows(shows);
      await AsyncStorage.setItem('driveAnimeShowsCacheTV', JSON.stringify(shows));
      animeLoaded.current = true;
    } catch (e) { console.log(e); } finally { setLoadingAnime(false); }
  }, [loadingAnime]);

  const cargarDoramas = useCallback(async (force = false) => {
    if (force) doramasLoaded.current = false;
    if (loadingDoramas || doramasLoaded.current) return;
    if (!force) {
      try {
        const cached = await AsyncStorage.getItem('driveDoramasShowsCacheTV');
        if (cached) {
          setDoramasShows(JSON.parse(cached));
          doramasLoaded.current = true;
          return;
        }
      } catch (e) {}
    }
    setLoadingDoramas(true);
    try {
      const shows = await cargarSeriesPlex(DRIVE_FOLDER_DORAMAS, 'driveDoramasCacheTV');
      setDoramasShows(shows);
      await AsyncStorage.setItem('driveDoramasShowsCacheTV', JSON.stringify(shows));
      doramasLoaded.current = true;
    } catch (e) { console.log(e); } finally { setLoadingDoramas(false); }
  }, [loadingDoramas]);

  const loadContinueWatching = useCallback(async () => {
    const items = await getContinueWatching();
    setContinueWatchingItems(items);
  }, []);

  const loadProfiles = useCallback(async () => {
    const profs = await getProfiles();
    setProfiles(profs);
    const activeId = await getCurrentProfileId();
    if (activeId && profs.some(p => p.id === activeId)) {
      setCurrentProfileId(activeId);
      const favs = await getFavorites(activeId);
      setFavorites(favs);
      setShowProfileScreen(false);
    } else if (profs.length > 0) {
      const first = profs[0];
      setCurrentProfileId(first.id);
      await setCurrentProfileId(first.id);
      const favs = await getFavorites(first.id);
      setFavorites(favs);
      setShowProfileScreen(false);
    } else {
      setShowProfileScreen(true);
    }
  }, []);

  const handleSelectProfile = async (id: string) => {
    setCurrentProfileId(id);
    await setCurrentProfileId(id);
    const favs = await getFavorites(id);
    setFavorites(favs);
    await loadContinueWatching();
    setShowProfileScreen(false);
  };

  const handleCreateProfile = async (newProfile: Profile) => {
    const updated = [...profiles, newProfile];
    setProfiles(updated);
    await saveProfiles(updated);
    await handleSelectProfile(newProfile.id);
  };

  const handleDeleteProfile = async (id: string) => {
    if (profiles.length <= 1) {
      Alert.alert('Error', 'Debes tener al menos un perfil.');
      return;
    }
    Alert.alert('Eliminar perfil', `¿Eliminar "${profiles.find(p => p.id === id)?.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const updated = profiles.filter(p => p.id !== id);
          setProfiles(updated);
          await saveProfiles(updated);
          if (currentProfileId === id) {
            const newId = updated[0].id;
            setCurrentProfileId(newId);
            await setCurrentProfileId(newId);
            const favs = await getFavorites(newId);
            setFavorites(favs);
            await loadContinueWatching();
          }
        },
      },
    ]);
  };

  const playChannel = useCallback(async (channel: Canal) => {
    setCurrentChannel(channel);
    setLoadingChannels(true);
    try {
      let stream: string | null = null;
      const forceProxy = await AsyncStorage.getItem('forceProxy').then(v => v === 'true');
      if (channel.embedSlug) {
        const opts = getSourceOptionsForSlug(channel.embedSlug);
        for (const opt of opts) {
          const resolved = await resolveStreamWithRenewal(channel.embedSlug, opt.url, isLegacyWebView || forceProxy);
          if (resolved) {
            stream = resolved;
            const idx = opts.indexOf(opt);
            setSelectedSourceIndex(idx);
            setSourceOptions(opts);
            break;
          }
        }
      }
      if (!stream && channel.url && esUrlManifiesto(channel.url)) {
        stream = channel.url;
      }
      if (stream) {
        setCurrentUrl(stream);
        if (channel.embedSlug) {
          streamCache.set(channel.embedSlug, { stream, timestamp: Date.now() });
        }
      } else {
        Alert.alert('Error', `No se pudo obtener el stream para ${channel.name}`);
      }
    } catch (e) {
      Alert.alert('Error', 'Error al cargar el canal');
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  const refreshCurrentStream = useCallback(async () => {
    if (!currentChannel) return;
    setLoadingChannels(true);
    try {
      const forceProxy = await AsyncStorage.getItem('forceProxy').then(v => v === 'true');
      const stream = await resolveStreamWithRenewal(currentChannel.embedSlug, currentChannel.url, isLegacyWebView || forceProxy);
      if (stream) {
        setCurrentUrl(stream);
        Alert.alert('Stream actualizado', 'El stream se ha renovado correctamente.');
      } else {
        Alert.alert('Error', 'No se pudo renovar el stream.');
      }
    } catch (e) {
      Alert.alert('Error', 'Error al renovar el stream.');
    } finally {
      setLoadingChannels(false);
    }
  }, [currentChannel]);

  const selectSource = useCallback(async (index: number) => {
    setSelectedSourceIndex(index);
    if (index < 0 || index >= sourceOptions.length) return;
    const sourceUrl = sourceOptions[index].url;
    setLoadingChannels(true);
    try {
      const forceProxy = await AsyncStorage.getItem('forceProxy').then(v => v === 'true');
      const stream = await resolveStreamWithRenewal(currentChannel?.embedSlug, sourceUrl, isLegacyWebView || forceProxy);
      if (stream) {
        setCurrentUrl(stream);
      } else {
        Alert.alert('Error', 'No se pudo cargar esta fuente');
      }
    } catch (e) {
      Alert.alert('Error', 'Error al cambiar de fuente');
    } finally {
      setLoadingChannels(false);
    }
  }, [sourceOptions, currentChannel]);

  const openPlayer = (item: any, type: string, title: string, url: string, poster: string, showId?: string, showName?: string, episodeCode?: string, initialTime = 0) => {
    setPlayerTitle(title);
    setPlayerUrl(url);
    setPlayerId(item.id || item.driveFileId || `temp-${Date.now()}`);
    setPlayerPoster(poster);
    setPlayerType(type);
    setPlayerShowId(showId || '');
    setPlayerShowName(showName || '');
    setPlayerEpisodeCode(episodeCode || '');
    setPlayerInitialTime(initialTime);
    setSourceOptions([]);
    setSelectedSourceIndex(0);
    setPlayerVisible(true);
  };

  const handlePlayWithResume = (item: ContinueWatchingItem) => {
    if (!item.progress || item.progress < 3) {
      openPlayer(item, item.type, item.title, item.streamUrl, item.poster, item.showId, item.showName, item.episodeCode, 0);
      return;
    }
    setResumeItem(item);
    setResumeDialogVisible(true);
  };

  const handleResume = () => {
    if (resumeItem) {
      openPlayer(resumeItem, resumeItem.type, resumeItem.title, resumeItem.streamUrl, resumeItem.poster, resumeItem.showId, resumeItem.showName, resumeItem.episodeCode, resumeItem.progress);
    }
    setResumeDialogVisible(false);
    setResumeItem(null);
  };

  const handleRestart = () => {
    if (resumeItem) {
      openPlayer(resumeItem, resumeItem.type, resumeItem.title, resumeItem.streamUrl, resumeItem.poster, resumeItem.showId, resumeItem.showName, resumeItem.episodeCode, 0);
    }
    setResumeDialogVisible(false);
    setResumeItem(null);
  };

  const handleCancelResume = () => {
    setResumeDialogVisible(false);
    setResumeItem(null);
  };

  const toggleLiveFullscreen = () => {
    setIsLiveFullscreen(!isLiveFullscreen);
    if (!isLiveFullscreen) setShowChannelOverlay(false);
  };

  const navigateToMenu = (menuId: string) => {
    setSelectedMenu(menuId);
    setViewMode('grid');
    setSelectedShow(null);
    if (menuId === 'DORAMAS') cargarDoramas();
    if (menuId === 'ANIME') cargarAnime();
    if (menuId === 'SERIES') cargarPlex();
    if (menuId === 'PELÍCULAS') cargarDriveMovies();
    if (menuId === 'CONTINUAR' || menuId === 'HISTORIAL') loadContinueWatching();
  };

  useEffect(() => {
    let tvEventHandler: any;
    if (Platform.isTV) {
      tvEventHandler = new TVEventHandler();
      tvEventHandler.enable(this, (cmp: any, evt: any) => {
        if (evt && evt.eventType === 'back') {
          if (resumeDialogVisible) {
            handleCancelResume();
          } else if (playerVisible) {
            setPlayerVisible(false);
          } else if (showChannelOverlay) {
            setShowChannelOverlay(false);
          } else if (isLiveFullscreen) {
            toggleLiveFullscreen();
          } else if (viewMode === 'detail') {
            setViewMode('grid');
            setSelectedShow(null);
          } else if (searchVisible) {
            setSearchVisible(false);
          }
        }
      });
    }
    return () => {
      if (tvEventHandler) tvEventHandler.disable();
    };
  }, [resumeDialogVisible, playerVisible, showChannelOverlay, isLiveFullscreen, viewMode, searchVisible]);

  useEffect(() => {
    const init = async () => {
      await loadProfiles();
      await cargarListaM3U();
      await cargarDriveMovies();
      await cargarPlex();
      await cargarAnime();
      await cargarDoramas();
      await loadContinueWatching();
      await lockLandscape();
    };
    init();
    const sub = Dimensions.addEventListener('change', ({ window }) => {});
    return () => { sub.remove(); };
  }, []);

  const TNT_INJECTION_BEFORE = `(function() {
    if (window.__NEXUS_TNT__) return;
    window.__NEXUS_TNT__ = true;
    function post(url) {
      try {
        if (typeof url !== 'string' || url.length < 12) return;
        if (!/(\\.m3u8|\\.mpd)(\\?|#|$)/i.test(url)) return;
        window.ReactNativeWebView.postMessage('FOUND_MANIFEST:' + url);
      } catch(e) {}
    }
    try {
      var origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        try { post(url); } catch(e) {}
        return origOpen.apply(this, arguments);
      };
    } catch(e) {}
    try {
      var origFetch = window.fetch;
      if (origFetch) {
        window.fetch = function(input, init) {
          try { 
            var u = typeof input === 'string' ? input : (input && input.url ? input.url : ''); 
            post(u); 
          } catch(e) {}
          return origFetch.apply(this, arguments).then(function(r) {
            try { if (r && r.url) post(r.url); } catch(e) {}
            return r;
          });
        };
      }
    } catch(e) {}
    function scanDOM() {
      try {
        var videos = document.getElementsByTagName('video');
        for (var i = 0; i < videos.length; i++) {
          var v = videos[i];
          post(v.src || v.currentSrc || '');
        }
        var sources = document.getElementsByTagName('source');
        for (var j = 0; j < sources.length; j++) {
          post(sources[j].getAttribute('src') || '');
        }
        var html = document.documentElement.innerHTML || '';
        var matches = html.match(/https?:\\/\\/[^"'\\s<>]+\\.m3u8[^"'\\s<>]*/gi);
        if (matches) {
          for (var k = 0; k < matches.length; k++) {
            post(matches[k]);
          }
        }
      } catch(e) {}
    }
    scanDOM();
    var interval = setInterval(scanDOM, 1500);
    setTimeout(function() {
      clearInterval(interval);
      window.ReactNativeWebView.postMessage('MANIFEST_TIMEOUT');
    }, 30000);
  })(); true;`;

  const TNT_INJECTION_AFTER = `(function() {})(); true;`;

  const renderCenterContent = () => {
    if (viewMode === 'detail' && selectedShow) {
      return (
        <SeriesDetail
          show={selectedShow}
          onBack={() => {
            setViewMode('grid');
            setSelectedShow(null);
          }}
          onPlayEpisode={(ep: PlexEpisode) => {
            openPlayer(ep, 'episode', `${selectedShow.title} - ${ep.code}`, ep.streamUrl, ep.poster || selectedShow.poster, selectedShow.id, selectedShow.title, ep.code, 0);
          }}
        />
      );
    }

    if (selectedMenu === 'TV') {
      return (
        <LivePlayerMini
          url={currentUrl}
          channel={currentChannel}
          loading={loadingChannels}
          onToggleFullscreen={toggleLiveFullscreen}
          onToggleChannelOverlay={() => setShowChannelOverlay(!showChannelOverlay)}
          fullscreen={false}
          sourceOptions={sourceOptions}
          selectedSourceIndex={selectedSourceIndex}
          onSelectSource={selectSource}
          onRefreshStream={refreshCurrentStream}
        />
      );
    } else if (selectedMenu === 'PELÍCULAS') {
      return (
        <MoviesGrid
          items={driveMovies}
          loading={loadingDrive}
          onRefresh={() => cargarDriveMovies(true)}
          onPlay={(item: MediaItem) => {
            openPlayer(item, 'movie', item.title, item.streamUrl || '', item.poster, undefined, undefined, undefined, 0);
          }}
        />
      );
    } else if (selectedMenu === 'SERIES') {
      return (
        <SeriesGrid
          shows={plexShows}
          loading={loadingPlex}
          onRefresh={() => cargarPlex(true)}
          onSelectShow={(show: PlexShow) => { setSelectedShow(show); setViewMode('detail'); }}
        />
      );
    } else if (selectedMenu === 'ANIME') {
      return (
        <SeriesGrid
          shows={animeShows}
          loading={loadingAnime}
          onRefresh={() => cargarAnime(true)}
          onSelectShow={(show: PlexShow) => { setSelectedShow(show); setViewMode('detail'); }}
          title="Anime"
        />
      );
    } else if (selectedMenu === 'DORAMAS') {
      return (
        <SeriesGrid
          shows={doramasShows}
          loading={loadingDoramas}
          onRefresh={() => cargarDoramas(true)}
          onSelectShow={(show: PlexShow) => { setSelectedShow(show); setViewMode('detail'); }}
          title="Doramas"
        />
      );
    } else if (selectedMenu === 'CONTINUAR') {
      return (
        <ContinueWatchingView
          items={continueWatchingItems}
          onPlay={handlePlayWithResume}
        />
      );
    } else if (selectedMenu === 'HISTORIAL') {
      return (
        <HistoryView
          items={continueWatchingItems}
          onPlay={handlePlayWithResume}
        />
      );
    } else if (selectedMenu === 'AJUSTES') {
      return <SettingsView />;
    } else {
      return (
        <View style={stylesTV.centerPlaceholder}>
          <Text style={stylesTV.placeholderText}>Sección en desarrollo</Text>
        </View>
      );
    }
  };

  const currentProfile = profiles.find(p => p.id === currentProfileId);

  if (showProfileScreen) {
    return (
      <View style={stylesTV.container}>
        <StatusBar hidden />
        <ProfileScreen
          profiles={profiles}
          onSelectProfile={handleSelectProfile}
          onCreateProfile={handleCreateProfile}
          onDeleteProfile={handleDeleteProfile}
        />
      </View>
    );
  }

  return (
    <View style={stylesTV.container}>
      <StatusBar hidden />

      {extractorUrl && !isLegacyWebView && (
        <WebView
          source={{ uri: extractorUrl }}
          originWhitelist={['*']}
          userAgent="Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36"
          javaScriptEnabled
          domStorageEnabled
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          androidLayerType="hardware"
          allowsInlineMediaPlayback
          mixedContentMode="always"
          cacheEnabled={false}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          onError={(syntheticEvent) => {
            if (extractorResolve.current) {
              extractorResolve.current(null);
              extractorResolve.current = null;
              setExtractorUrl(null);
            }
          }}
          onMessage={(e) => {
            const data = e.nativeEvent.data;
            if (data?.startsWith('FOUND_MANIFEST:')) {
              const stream = data.replace('FOUND_MANIFEST:', '');
              if (stream?.startsWith('http') && extractorResolve.current) {
                extractorResolve.current(stream);
                extractorResolve.current = null;
                setExtractorUrl(null);
              }
            }
            if (data === 'MANIFEST_TIMEOUT' && extractorResolve.current) {
              extractorResolve.current(null);
              extractorResolve.current = null;
              setExtractorUrl(null);
            }
          }}
        />
      )}

      <GlobalSearch
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        movies={driveMovies}
        series={plexShows}
        anime={animeShows}
        doramas={doramasShows}
        channels={listaCanales}
        onPlayMedia={openPlayer}
        onSelectShow={(show: PlexShow) => {
          const found = [...plexShows, ...animeShows, ...doramasShows].find(s => s.id === show.id);
          if (found) {
            setSelectedShow(found);
            setViewMode('detail');
            setSelectedMenu('SERIES');
          }
        }}
        onSelectChannel={playChannel}
      />

      <ResumeDialog
        visible={resumeDialogVisible}
        item={resumeItem}
        onResume={handleResume}
        onRestart={handleRestart}
        onCancel={handleCancelResume}
      />

      {playerVisible && playerUrl && (
        <ReproductorMejorado
          url={playerUrl}
          onClose={() => setPlayerVisible(false)}
          title={playerTitle}
          id={playerId}
          poster={playerPoster}
          type={playerType}
          showId={playerShowId}
          showName={playerShowName}
          episodeCode={playerEpisodeCode}
          sourceOptions={sourceOptions}
          selectedSourceIndex={selectedSourceIndex}
          onSelectSource={selectSource}
          initialTime={playerInitialTime}
          onRefreshStream={refreshCurrentStream}
        />
      )}

      {selectedMenu === 'TV' && isLiveFullscreen ? (
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#000' }}>
          <View style={{ flex: 1 }}>
            <LivePlayerMini
              url={currentUrl}
              channel={currentChannel}
              loading={loadingChannels}
              onToggleFullscreen={toggleLiveFullscreen}
              onToggleChannelOverlay={() => setShowChannelOverlay(!showChannelOverlay)}
              fullscreen={true}
              sourceOptions={sourceOptions}
              selectedSourceIndex={selectedSourceIndex}
              onSelectSource={selectSource}
              onRefreshStream={refreshCurrentStream}
            />
          </View>
          {showChannelOverlay && (
            <View style={stylesTV.channelListOverlayContainer}>
              <ChannelList
                channels={listaCanales}
                currentChannel={currentChannel}
                favorites={favorites}
                onSelectChannel={playChannel}
                onToggleFavorite={async (id: string) => {
                  const newFavs = favorites.includes(id) ? favorites.filter(f => f !== id) : [...favorites, id];
                  setFavorites(newFavs);
                  await saveFavorites(newFavs);
                }}
                onClose={() => setShowChannelOverlay(false)}
                isOverlay={true}
              />
            </View>
          )}
        </View>
      ) : (
        <View style={stylesTV.layout}>
          <View style={stylesTV.leftPanel}>
            <View style={stylesTV.logoContainer}>
              <Text style={stylesTV.logoText}>NEXUS<Text style={stylesTV.logoAccent}>TV</Text></Text>
            </View>
            <FlatList
              data={[
                { id: 'TV', label: 'TV', icon: 'tv' },
                { id: 'PELÍCULAS', label: 'PELÍCULAS', icon: 'film' },
                { id: 'SERIES', label: 'SERIES', icon: 'tv-outline' },
                { id: 'ANIME', label: 'ANIME', icon: 'brush' },
                { id: 'DORAMAS', label: 'DORAMAS', icon: 'heart' },
                { id: 'CONTINUAR', label: 'CONTINUAR', icon: 'time-outline' },
                { id: 'HISTORIAL', label: 'HISTORIAL', icon: 'calendar-outline' },
                { id: 'AJUSTES', label: 'AJUSTES', icon: 'settings-outline' },
              ]}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                const isActive = selectedMenu === item.id;
                return (
                  <Focusable
                    style={[stylesTV.menuItem, isActive && stylesTV.menuItemActive]}
                    onPress={() => navigateToMenu(item.id)}
                    hasTVPreferredFocus={item.id === 'TV'}
                  >
                    <Ionicons name={item.icon as any} size={isTV ? 28 : 22} color={isActive ? '#ff1744' : 'rgba(255,255,255,0.6)'} style={stylesTV.menuIcon} />
                    <Text style={[stylesTV.menuText, isActive && stylesTV.menuTextActive]}>
                      {item.label}
                    </Text>
                    {isActive && <View style={stylesTV.menuIndicator} />}
                  </Focusable>
                );
              }}
              contentContainerStyle={{ paddingBottom: isTV ? 60 : 40 }}
            />
          </View>

          <View style={[stylesTV.centerPanel, { overflow: 'hidden' }]}>
            <AppHeader
              userName={currentProfile?.name || 'Invitado'}
              avatarUrl={undefined}
              onSettingsPress={() => navigateToMenu('AJUSTES')}
              onHistoryPress={() => {
                navigateToMenu('HISTORIAL');
                loadContinueWatching();
              }}
              onContinueWatchingPress={() => {
                navigateToMenu('CONTINUAR');
                loadContinueWatching();
              }}
              onSearchPress={() => setSearchVisible(true)}
              onProfilePress={() => setShowProfileScreen(true)}
            />
            <View style={{ flex: 1, overflow: 'hidden' }}>
              {renderCenterContent()}
            </View>
          </View>

          {selectedMenu === 'TV' && viewMode !== 'detail' && (
            <View style={stylesTV.rightPanel}>
              <ChannelList
                channels={listaCanales}
                currentChannel={currentChannel}
                favorites={favorites}
                onSelectChannel={playChannel}
                onToggleFavorite={async (id: string) => {
                  const newFavs = favorites.includes(id) ? favorites.filter(f => f !== id) : [...favorites, id];
                  setFavorites(newFavs);
                  await saveFavorites(newFavs);
                }}
                isOverlay={false}
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ============================================================
// ESTILOS
// ============================================================
const stylesTV = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a12' },
  layout: { flex: 1, flexDirection: 'row' },
  leftPanel: {
    width: isTV ? 220 : 180,
    backgroundColor: 'rgba(16,10,24,0.95)',
    paddingVertical: isTV ? 35 : 25,
    paddingHorizontal: isTV ? 20 : 15,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
  },
  logoContainer: { marginBottom: isTV ? 60 : 40, paddingLeft: 10 },
  logoText: {
    color: '#fff',
    fontSize: isTV ? 42 : 34,
    fontWeight: '900',
    letterSpacing: 3,
    textShadowColor: 'rgba(255,23,68,0.8)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 15,
  },
  logoAccent: { color: '#ff1744' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: isTV ? 18 : 14,
    paddingHorizontal: isTV ? 20 : 16,
    marginBottom: isTV ? 10 : 6,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  menuItemActive: {
    backgroundColor: 'rgba(255,23,68,0.15)',
    borderRightWidth: 3,
    borderRightColor: '#ff1744',
  },
  menuIcon: { marginRight: isTV ? 18 : 14 },
  menuText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: isTV ? 20 : 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  menuTextActive: { color: '#FFFFFF', fontWeight: '700' },
  menuIndicator: {
    position: 'absolute',
    right: 0,
    top: '20%',
    height: '60%',
    width: 4,
    backgroundColor: '#ff1744',
    borderRadius: 4,
    shadowColor: '#ff1744',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  centerPanel: {
    flex: 1,
    backgroundColor: '#0a0a12',
  },
  centerPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a12' },
  placeholderText: { color: 'rgba(255,255,255,0.3)', fontSize: isTV ? 28 : 20, fontWeight: '600' },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a12' },
  rightPanel: {
    width: isTV ? 320 : 260,
    backgroundColor: 'rgba(16,10,24,0.95)',
    paddingVertical: isTV ? 25 : 15,
    paddingHorizontal: isTV ? 15 : 10,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
  },
  channelListContainer: { flex: 1 },
  channelListOverlay: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: isTV ? 320 : 260,
    backgroundColor: 'rgba(16,10,24,0.98)',
    paddingVertical: isTV ? 25 : 15,
    paddingHorizontal: isTV ? 15 : 10,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.1)',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: -10, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 30,
    elevation: 30,
  },
  channelListOverlayContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: isTV ? 320 : 260,
    zIndex: 20,
  },
  channelListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: isTV ? 20 : 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: isTV ? 15 : 10,
  },
  closeOverlayBtn: {
    padding: isTV ? 12 : 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
  },
  rightTitle: { color: 'rgba(255,255,255,0.8)', fontSize: isTV ? 20 : 16, fontWeight: '700', letterSpacing: 1 },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: isTV ? 16 : 12,
    paddingHorizontal: isTV ? 16 : 12,
    borderRadius: 10,
    marginBottom: isTV ? 6 : 4,
    backgroundColor: 'transparent',
  },
  channelItemActive: {
    backgroundColor: 'rgba(255,23,68,0.15)',
    borderLeftWidth: 3,
    borderLeftColor: '#ff1744',
  },
  channelLogoContainer: {
    width: isTV ? 56 : 44,
    height: isTV ? 56 : 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: isTV ? 16 : 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  channelLogo: { width: '100%', height: '100%', resizeMode: 'contain' },
  channelLogoFallback: { color: 'rgba(255,255,255,0.3)', fontSize: isTV ? 20 : 16, fontWeight: '700' },
  channelInfo: { flex: 1, justifyContent: 'center' },
  channelName: { color: '#FFFFFF', fontSize: isTV ? 18 : 15, fontWeight: '600' },
  channelNow: { color: 'rgba(255,255,255,0.4)', fontSize: isTV ? 14 : 12, marginTop: 2 },
  channelActiveIndicator: { marginLeft: 4 },
  headerContainer: {
    height: isTV ? 80 : 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: isTV ? 30 : 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  avatarContainer: { marginRight: isTV ? 16 : 12 },
  avatar: { width: isTV ? 48 : 36, height: isTV ? 48 : 36, borderRadius: isTV ? 24 : 18 },
  avatarPlaceholder: {
    width: isTV ? 48 : 36,
    height: isTV ? 48 : 36,
    borderRadius: isTV ? 24 : 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: { color: '#fff', fontSize: isTV ? 22 : 18, fontWeight: '600' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: isTV ? 30 : 20,
    paddingVertical: isTV ? 10 : 6,
    paddingHorizontal: isTV ? 18 : 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerBtnPrimary: { backgroundColor: 'rgba(255,23,68,0.25)', borderColor: '#ff1744' },
  headerBtnSecondary: { backgroundColor: 'rgba(255,255,255,0.05)' },
  headerBtnText: { color: '#fff', fontSize: isTV ? 18 : 14, marginLeft: 6 },
  liveContainer: { flex: 1, backgroundColor: '#000' },
  miniControls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: isTV ? 25 : 15,
  },
  miniTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: isTV ? 20 : 10,
  },
  miniTitle: { color: '#fff', fontSize: isTV ? 28 : 20, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  miniActions: { flexDirection: 'row', gap: isTV ? 16 : 12 },
  miniBtn: { padding: isTV ? 12 : 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20 },
  miniCenter: { alignItems: 'center', justifyContent: 'center' },
  miniPlayBtn: { padding: 8 },
  miniPlayGradient: {
    width: isTV ? 100 : 70,
    height: isTV ? 100 : 70,
    borderRadius: isTV ? 50 : 35,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff1744',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 15,
  },
  messagesSection: {
    flex: 0.35,
    backgroundColor: 'rgba(10,10,18,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  messagesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: isTV ? 20 : 16,
    paddingHorizontal: isTV ? 32 : 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  messageIcon: { marginRight: isTV ? 16 : 12 },
  messageText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: isTV ? 20 : 16,
    fontWeight: '500',
    textAlign: 'center',
    flex: 1,
  },
  gridContainer: { flex: 1, backgroundColor: '#0a0a12', paddingHorizontal: isTV ? 30 : 20, paddingTop: isTV ? 30 : 20 },
  gridSectionTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: isTV ? 28 : 22,
    fontWeight: '800',
    marginBottom: isTV ? 20 : 15,
    letterSpacing: 1,
    textShadowColor: 'rgba(255,23,68,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  gridSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: isTV ? 20 : 16,
    marginBottom: isTV ? 25 : 20,
    height: isTV ? 60 : 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  gridSearchInput: { flex: 1, color: '#fff', fontSize: isTV ? 20 : 16, marginLeft: isTV ? 16 : 12 },
  gridItem: {
    width: isTV ? '15%' : '23%',
    marginRight: isTV ? '2%' : '2%',
    marginBottom: isTV ? 32 : 24,
    alignItems: 'center',
  },
  gridPosterContainer: {
    width: '100%',
    aspectRatio: 2/3,
    borderRadius: 12,
    backgroundColor: '#1a1a24',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
    position: 'relative',
  },
  gridPoster: { width: '100%', height: '100%', borderRadius: 12 },
  gridRating: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: isTV ? 12 : 8,
    paddingVertical: isTV ? 6 : 4,
    borderRadius: 12,
  },
  gridRatingText: { color: '#fff', fontSize: isTV ? 16 : 12, marginLeft: 4, fontWeight: '600' },
  gridTitle: {
    color: '#fff',
    fontSize: isTV ? 18 : 14,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  gridYear: { color: 'rgba(255,255,255,0.4)', fontSize: isTV ? 16 : 12, textAlign: 'center', marginTop: 2 },
  detailBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: isTV ? 20 : 12,
    paddingVertical: isTV ? 12 : 8,
    paddingHorizontal: isTV ? 18 : 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignSelf: 'flex-start',
  },
  detailBackText: { color: '#fff', fontSize: isTV ? 22 : 18, fontWeight: '700', marginLeft: 6 },
  detailOverview: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: isTV ? 18 : 14,
    marginBottom: isTV ? 28 : 20,
    lineHeight: isTV ? 26 : 20,
    paddingHorizontal: 4,
  },
  detailSeasonBlock: { marginBottom: isTV ? 36 : 28 },
  detailEpisodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: isTV ? 18 : 14,
    paddingHorizontal: isTV ? 16 : 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    marginBottom: isTV ? 8 : 6,
  },
  detailEpisodeCodeBox: {
    backgroundColor: 'rgba(255,23,68,0.2)',
    paddingHorizontal: isTV ? 14 : 10,
    paddingVertical: isTV ? 8 : 6,
    borderRadius: 8,
    marginRight: isTV ? 18 : 14,
  },
  detailEpisodeCode: { color: '#ff1744', fontSize: isTV ? 16 : 13, fontWeight: '700' },
  detailEpisodeTitle: { color: '#fff', fontSize: isTV ? 18 : 15, flex: 1 },
  modalFullscreen: { flex: 1, backgroundColor: '#000' },
  modalCloseBtn: {
    position: 'absolute',
    top: isTV ? 40 : 30,
    right: isTV ? 40 : 30,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: isTV ? 16 : 12,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  modalLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 10,
  },
  modalControls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: isTV ? 30 : 20,
    paddingVertical: isTV ? 60 : 40,
  },
  modalControlTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  playerTitle: { color: '#fff', fontSize: isTV ? 26 : 20, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6, flex: 1 },
  sourceBtn: { padding: isTV ? 12 : 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, marginLeft: 10 },
  modalControlCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isTV ? 40 : 30,
  },
  modalPlayBtn: {
    width: isTV ? 100 : 80,
    height: isTV ? 100 : 80,
    borderRadius: isTV ? 50 : 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPlayGradient: {
    width: '100%',
    height: '100%',
    borderRadius: isTV ? 50 : 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalControlBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isTV ? 20 : 16,
  },
  modalError: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.85)' },
  sourceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sourceModalContent: {
    width: isTV ? '60%' : '80%',
    maxHeight: '70%',
    backgroundColor: 'rgba(20,15,30,0.95)',
    borderRadius: 16,
    padding: isTV ? 30 : 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sourceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: isTV ? 25 : 20,
  },
  sourceModalTitle: { color: '#fff', fontSize: isTV ? 26 : 20, fontWeight: '700' },
  sourceOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: isTV ? 18 : 14,
    paddingHorizontal: isTV ? 16 : 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  sourceOptionSelected: {
    backgroundColor: 'rgba(255,23,68,0.15)',
    borderRadius: 8,
  },
  sourceOptionText: { color: 'rgba(255,255,255,0.8)', fontSize: isTV ? 20 : 16, fontWeight: '500' },
  sourceOptionTextSelected: { color: '#fff', fontWeight: '700' },
  resumeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resumeContent: {
    width: isTV ? '60%' : '85%',
    backgroundColor: 'rgba(20,15,30,0.95)',
    borderRadius: 20,
    padding: isTV ? 30 : 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  resumeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: isTV ? 20 : 16,
  },
  resumeTitle: { color: '#fff', fontSize: isTV ? 26 : 22, fontWeight: '700' },
  resumePoster: {
    width: isTV ? 160 : 120,
    height: isTV ? 240 : 180,
    borderRadius: 12,
    marginBottom: isTV ? 20 : 16,
    backgroundColor: '#2a2a34',
  },
  resumeItemTitle: { color: '#fff', fontSize: isTV ? 22 : 18, fontWeight: '600', textAlign: 'center', marginBottom: isTV ? 12 : 8 },
  resumeProgressText: { color: 'rgba(255,255,255,0.6)', fontSize: isTV ? 20 : 16, marginBottom: isTV ? 25 : 20 },
  resumeButtons: { width: '100%' },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: isTV ? 18 : 14,
    borderRadius: 12,
    marginBottom: isTV ? 16 : 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  resumeBtnPrimary: { backgroundColor: '#ff1744', borderColor: '#ff1744' },
  resumeBtnSecondary: { backgroundColor: 'rgba(255,255,255,0.05)' },
  resumeBtnText: { color: '#fff', fontSize: isTV ? 20 : 16, fontWeight: '600', marginLeft: 10 },
  profileFullScreen: {
    flex: 1,
    backgroundColor: '#0a0a12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileFullContent: {
    width: '80%',
    maxWidth: 1000,
    alignItems: 'center',
  },
  profileFullTitle: {
    color: '#fff',
    fontSize: isTV ? 48 : 32,
    fontWeight: '700',
    marginBottom: isTV ? 50 : 30,
    textShadowColor: 'rgba(255,23,68,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  profileFullList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: isTV ? 30 : 20,
  },
  profileFullItem: {
    alignItems: 'center',
    padding: isTV ? 20 : 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: isTV ? 140 : 100,
  },
  profileFullAvatarContainer: {
    position: 'relative',
    marginBottom: 10,
  },
  profileFullAvatar: {
    fontSize: isTV ? 72 : 48,
    width: isTV ? 120 : 80,
    height: isTV ? 120 : 80,
    textAlign: 'center',
    lineHeight: isTV ? 120 : 80,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 60,
    overflow: 'hidden',
  },
  profileFullDelete: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 2,
  },
  profileFullName: {
    color: '#fff',
    fontSize: isTV ? 20 : 16,
    fontWeight: '600',
    marginTop: 8,
  },
  profileFullAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: isTV ? 20 : 12,
    minWidth: isTV ? 140 : 100,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    borderStyle: 'dashed',
  },
  profileFullAddCircle: {
    width: isTV ? 120 : 80,
    height: isTV ? 120 : 80,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileFullAddText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: isTV ? 16 : 12,
    marginTop: 8,
  },
  profileFullHint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: isTV ? 18 : 14,
    marginTop: isTV ? 40 : 20,
    letterSpacing: 1,
  },
  profileCreateFull: {
    width: '60%',
    maxWidth: 500,
    backgroundColor: 'rgba(20,15,30,0.95)',
    borderRadius: 24,
    padding: isTV ? 40 : 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  profileCreateTitleFull: {
    color: '#fff',
    fontSize: isTV ? 32 : 24,
    fontWeight: '700',
    marginBottom: 30,
  },
  profileInputFull: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: isTV ? 20 : 16,
    padding: isTV ? 16 : 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 24,
  },
  profileCreateActionsFull: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    width: '100%',
  },
  searchContainer: {
    flex: 1,
    backgroundColor: '#0a0a12',
    paddingTop: isTV ? 40 : 20,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isTV ? 30 : 20,
    paddingBottom: isTV ? 20 : 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: isTV ? 24 : 18,
    marginLeft: isTV ? 16 : 12,
    backgroundColor: 'transparent',
  },
  searchEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchEmptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: isTV ? 22 : 16,
    marginTop: 16,
    textAlign: 'center',
  },
  searchResultsList: {
    padding: isTV ? 20 : 12,
  },
  searchResultItem: {
    flexDirection: 'row',
    padding: isTV ? 16 : 12,
    marginBottom: isTV ? 12 : 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    flex: 1,
    marginHorizontal: isTV ? 8 : 4,
  },
  searchResultPoster: {
    width: isTV ? 80 : 60,
    height: isTV ? 120 : 90,
    borderRadius: 8,
    marginRight: isTV ? 16 : 12,
  },
  searchResultInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  searchResultTitle: {
    color: '#fff',
    fontSize: isTV ? 20 : 16,
    fontWeight: '700',
  },
  searchResultSource: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: isTV ? 16 : 12,
    marginTop: 4,
  },
  searchResultYear: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: isTV ? 14 : 10,
  },
  searchResultNow: {
    color: '#ff1744',
    fontSize: isTV ? 16 : 12,
    marginTop: 4,
  },
  loadingText: { color: 'rgba(255,255,255,0.8)', fontSize: isTV ? 20 : 16, marginTop: 16 },
  controlLabel: { color: '#fff', fontSize: isTV ? 16 : 12, marginTop: 2 },
  timeText: { color: '#fff', fontSize: isTV ? 20 : 16, fontWeight: '600', minWidth: isTV ? 70 : 50, textAlign: 'center' },
  errorText: { color: '#fff', fontSize: isTV ? 22 : 18, marginTop: 16, textAlign: 'center', fontWeight: '600' },
  progressTrack: { flex: 1, height: isTV ? 14 : 10, justifyContent: 'center', position: 'relative' },
  progressBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: isTV ? 6 : 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    height: isTV ? 8 : 6,
    borderRadius: 3,
    backgroundColor: '#ff1744',
    shadowColor: '#ff1744',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  progressThumb: {
    position: 'absolute',
    width: isTV ? 28 : 22,
    height: isTV ? 28 : 22,
    borderRadius: isTV ? 14 : 11,
    top: isTV ? -11 : -8,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    marginLeft: isTV ? -14 : -11,
  },
  settingsContainer: {
    flex: 1,
    backgroundColor: '#0a0a12',
    paddingHorizontal: isTV ? 40 : 30,
    paddingTop: isTV ? 40 : 30,
  },
  settingsCard: {
    backgroundColor: 'rgba(20,15,30,0.9)',
    borderRadius: 16,
    padding: isTV ? 32 : 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: isTV ? 16 : 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  settingsLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: isTV ? 20 : 16,
    fontWeight: '500',
    marginLeft: isTV ? 20 : 14,
    flex: 1,
  },
  settingsValue: {
    color: '#fff',
    fontSize: isTV ? 20 : 16,
    fontWeight: '600',
  },
  settingsWhatsAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: isTV ? 30 : 20,
    paddingVertical: isTV ? 18 : 12,
    backgroundColor: 'rgba(37,211,102,0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#25D366',
  },
  settingsWhatsAppText: {
    color: '#25D366',
    fontSize: isTV ? 22 : 18,
    fontWeight: '700',
    marginLeft: 12,
  },
  continueProgressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: isTV ? 8 : 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  continueProgressFill: {
    height: isTV ? 8 : 6,
    backgroundColor: '#ff1744',
    borderRadius: 3,
  },
  focused: {
    borderColor: '#ff1744',
    borderWidth: 3,
    shadowColor: '#ff1744',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 15,
    transform: [{ scale: 1.05 }],
  },
});
