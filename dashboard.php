<?php
session_start();

if (!isset($_SESSION['username'])) {
    header("Location: index.html");
    exit();
}

echo "Bienvenido, " . htmlspecialchars($_SESSION['username']) . "!";
?>

<a href="logout.php">Cerrar sesión</a>
