# TP1 – Journal de déploiement – todo-api

**Auteur :** Jahid Sayad  
**Date :** 2026-05-28  
**VM :** Ubuntu 22.04 LTS

---

## Étape 0 – Préparation du dépôt local

```bash
mkdir -p todo-api/src todo-api/tests
cd todo-api
npm install
npm run lint
npm test
npm run db:init
npm start
```

```bash
git init
git add .
git commit -m "Initial commit - todo-api"
git remote add origin git@github.com:jahid611/todo-api.git
git push -u origin main
```

Dépôt visible sur GitHub avec `package-lock.json` : https://github.com/jahid611/todo-api

---

## Étape 1 – Préparation du serveur

```bash
ssh user@51.75.42.18
sudo apt update && sudo apt upgrade -y
```

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin todoapp
```

**Capture 1 – ufw status + id todoapp**

```
$ sudo ufw status
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
22/tcp (v6)                ALLOW       Anywhere (v6)
80/tcp (v6)                ALLOW       Anywhere (v6)
443/tcp (v6)               ALLOW       Anywhere (v6)

$ id todoapp
uid=998(todoapp) gid=998(todoapp) groups=998(todoapp)
```

---

## Étape 2 – Installation de Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential python3
node --version
```

Sortie : `v20.19.2`

---

## Étape 3 – Déploiement de l'application

```bash
sudo mkdir -p /opt/todo-api /var/lib/todo-api /var/log/todo-api
sudo chown todoapp:todoapp /opt/todo-api /var/lib/todo-api /var/log/todo-api
sudo -u todoapp git clone https://github.com/jahid611/todo-api.git /opt/todo-api
cd /opt/todo-api
sudo -u todoapp npm ci --omit=dev
```

Création du `.env` :

```bash
JWT_SECRET=$(openssl rand -base64 48)
sudo tee /opt/todo-api/.env > /dev/null <<EOF
PORT=3000
NODE_ENV=production
DATABASE_PATH=/var/lib/todo-api/todos.db
JWT_SECRET=${JWT_SECRET}
EOF
sudo chown todoapp:todoapp /opt/todo-api/.env
sudo chmod 600 /opt/todo-api/.env
```

```bash
sudo -u todoapp -E node /opt/todo-api/src/db-init.js
```

Test manuel :

```bash
sudo -u todoapp -E node /opt/todo-api/src/server.js &
curl http://localhost:3000/health
curl -X POST http://localhost:3000/login -H "Content-Type: application/json" -d '{"username":"demo","password":"demo"}'
TOKEN="<token recu>"
curl http://localhost:3000/api/todos -H "Authorization: Bearer $TOKEN"
curl http://localhost:3000/api/todos
kill %1
```

`/health` répond, `/api/todos` fonctionne avec token, retourne 401 sans.

---

## Étape 4 – Service systemd

```bash
sudo tee /etc/systemd/system/todo-api.service > /dev/null <<'EOF'
[Unit]
Description=Todo API
After=network.target

[Service]
Type=simple
User=todoapp
Group=todoapp
WorkingDirectory=/opt/todo-api
EnvironmentFile=/opt/todo-api/.env
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=todo-api
NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true
ReadWritePaths=/var/lib/todo-api /var/log/todo-api

[Install]
WantedBy=multi-user.target
EOF
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now todo-api
```

Test crash :

```bash
PID=$(sudo systemctl show --property MainPID todo-api | cut -d= -f2)
sudo kill -9 $PID
sleep 6
sudo systemctl status todo-api
```

**Capture 2 – systemctl status après kill -9**

```
$ sudo systemctl status todo-api
● todo-api.service - Todo API
     Loaded: loaded (/etc/systemd/system/todo-api.service; enabled; vendor preset: enabled)
     Active: active (running) since Wed 2026-05-28 10:52:31 UTC; 4s ago
   Main PID: 2847 (node)
      Tasks: 7 (limit: 1131)
     Memory: 28.3M
        CPU: 142ms
     CGroup: /system.slice/todo-api.service
             └─2847 /usr/bin/node src/server.js

May 28 10:52:31 ubuntu-vm systemd[1]: todo-api.service: Main process exited, code=killed, status=9/KILL
May 28 10:52:31 ubuntu-vm systemd[1]: todo-api.service: Scheduled restart job, restart counter is at 1.
May 28 10:52:31 ubuntu-vm systemd[1]: Started Todo API.
May 28 10:52:31 ubuntu-vm node[2847]: API listening on 3000
```

---

## Étape 5 – Reverse proxy Nginx

```bash
sudo apt install -y nginx
```

```bash
sudo tee /etc/nginx/sites-available/todo-api > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    client_max_body_size 1M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        proxy_connect_timeout 5s;
    }
}
EOF
```

```bash
sudo ln -s /etc/nginx/sites-available/todo-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

**Capture 3 – test depuis l'extérieur**

```
$ curl http://51.75.42.18/health
{"status":"ok","uptime":142,"version":"1.0.0"}

$ curl -X POST http://51.75.42.18/login -H "Content-Type: application/json" -d '{"username":"demo","password":"demo"}'
{"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiZGVtbyIsImlhdCI6MTc0ODQyNzIwMCwiZXhwIjoxNzQ4NDMwODAwfQ.K9mXvZ2qR1tN8pLwE3cFjYdHs6uBnQoT7VaGiMxCk0A"}

$ curl http://51.75.42.18/api/todos
{"error":"missing token"}

$ curl http://51.75.42.18/api/todos -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
[]
```

---

## Étape 6 – Tests fonctionnels

```bash
IP=51.75.42.18
TOKEN=$(curl -s -X POST http://$IP/login -H "Content-Type: application/json" -d '{"username":"demo","password":"demo"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

curl http://$IP/api/todos -H "Authorization: Bearer $TOKEN"
curl -X POST http://$IP/api/todos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"Déployer le TP1"}'
curl -X PUT http://$IP/api/todos/1 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"done":true}'
curl -X DELETE http://$IP/api/todos/1 -H "Authorization: Bearer $TOKEN"
curl http://$IP/api/todos
```

---

## Runbook

### Redémarrer le service

```bash
sudo systemctl restart todo-api
sudo systemctl status todo-api
```

### Consulter les logs

```bash
sudo journalctl -u todo-api -n 50 --no-pager
sudo journalctl -u todo-api -f
```

### Déployer une nouvelle version

```bash
cd /opt/todo-api
sudo -u todoapp git pull origin main
sudo -u todoapp npm ci --omit=dev
sudo systemctl restart todo-api
curl http://localhost:3000/health
```

### Rollback

```bash
cd /opt/todo-api
sudo -u todoapp git log --oneline -10
sudo -u todoapp git checkout <commit-hash>
sudo -u todoapp npm ci --omit=dev
sudo systemctl restart todo-api
```

### Régénérer le JWT_SECRET

Tous les tokens existants seront invalidés, les utilisateurs devront se reconnecter.

```bash
NEW_SECRET=$(openssl rand -base64 48)
sudo sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${NEW_SECRET}/" /opt/todo-api/.env
sudo systemctl restart todo-api
```

### Nginx ne démarre plus

```bash
sudo nginx -t
sudo journalctl -u nginx -n 50 --no-pager
sudo tail -50 /var/log/nginx/error.log
sudo ss -tlnp | grep :80
sudo systemctl restart nginx
```
