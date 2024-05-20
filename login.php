<?php
session_start();

$users = json_decode(file_get_contents('users.json'), true);

$username = $_POST['username'];
$password = $_POST['password'];

if (isset($users[$username]) && password_verify($password, $users[$username])) {
    $_SESSION['username'] = $username;
    header("Location: dashboard.php");
    exit();
} else {
    echo "Usuario o contraseña incorrectos.";
}
?>
