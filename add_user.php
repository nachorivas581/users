<?php
if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $new_username = $_POST['new_username'];
    $new_password = password_hash($_POST['new_password'], PASSWORD_DEFAULT);

    $users = json_decode(file_get_contents('users.json'), true);
    $users[$new_username] = $new_password;

    file_put_contents('users.json', json_encode($users));

    echo "Usuario agregado correctamente.";
}
?>

<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agregar Usuario</title>
</head>
<body>
    <h2>Agregar Usuario</h2>
    <form action="add_user.php" method="POST">
        <label for="new_username">Nuevo Usuario:</label>
        <input type="text" id="new_username" name="new_username" required><br><br>
        <label for="new_password">Nueva Contraseña:</label>
        <input type="password" id="new_password" name="new_password" required><br><br>
        <input type="submit" value="Agregar Usuario">
    </form>
</body>
</html>
