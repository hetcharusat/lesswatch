# 🍿 Watch Together - Oracle Cloud Infrastructure (OCI) Deployment Guide

This guide covers deploying Watch Together to an **Oracle Cloud Infrastructure (OCI) Always-Free VM** (Ubuntu 22.04 / 24.04 LTS on Ampere A1 ARM64 or AMD x86_64).

---

## 🚀 Quick Start (Automated 3-Step Deploy)

### Step 1: Package & Upload to Your OCI VM

From your Windows machine in the project root (`e:\Watch Together`):

If using your SSH key `WATCH-TOGETHER.pem`:
```powershell
scp -i WATCH-TOGETHER.pem -C watch-together-oci.tar.gz ubuntu@YOUR_OCI_IP:~/
```
*(Replace `YOUR_OCI_IP` with your Oracle Cloud instance public IP address)*

---

### Step 2: SSH into Your OCI Server
```powershell
ssh -i WATCH-TOGETHER.pem ubuntu@YOUR_OCI_IP
```

---

### Step 3: Extract and Run the OCI Deployer
On your Oracle Cloud VM terminal, run:
```bash
# Create directory and extract bundle
mkdir -p watch-together && tar -xzvf watch-together-oci.tar.gz -C watch-together
cd watch-together

# Run automated deployment
sudo chmod +x deploy-oci.sh
sudo ./deploy-oci.sh
```

What `deploy-oci.sh` automatically does for you:
1. **Installs Docker Engine & Compose plugin** (if not already installed).
2. **Configures host firewall (`iptables` & `ufw`)** to bypass Oracle Linux/Ubuntu's default block rules.
3. **Generates secure `.env` secrets** (cryptographically random LiveKit SFU secret and Vault keys).
4. **Builds the optimized multi-stage Docker container** (with FFmpeg, yt-dlp, aria2, and Caddy reverse proxy).
5. **Starts the entire stack with automatic restart policies**.

---

## ⚠️ Critical: Oracle Cloud VCN Security Rules

Oracle Cloud blocks all inbound network traffic by default except SSH (Port 22). **You must open these ports in your OCI Web Console**, otherwise your browser cannot connect:

1. In the Oracle Cloud Console, navigate to:
   **Networking ➔ Virtual Cloud Networks ➔ Your VCN ➔ Security Lists ➔ Default Security List**.
2. Click **Add Ingress Rules** and add the following:

| Source CIDR | IP Protocol | Destination Port Range | Description |
| :--- | :--- | :--- | :--- |
| `0.0.0.0/0` | **TCP** | `80` | HTTP / Let's Encrypt Certificate Challenge |
| `0.0.0.0/0` | **TCP** | `443` | HTTPS (Secure Web & WebSockets) |
| `0.0.0.0/0` | **TCP** | `3000` | Watch Together Direct Web Port |
| `0.0.0.0/0` | **TCP** | `7880-7881` | LiveKit Voice & Video SFU Signaling |
| `0.0.0.0/0` | **UDP** | `50000-50200` | LiveKit WebRTC Audio/Video Media Channels |

---

## 🌸 Accessing Your Live Instance & Running First-Time Setup

Once the deployment script finishes:
1. Open your browser and navigate to:
   ```
   http://YOUR_OCI_IP:3000
   ```
   *(or `http://YOUR_OCI_IP` if Caddy reverse proxy is active)*
2. The **First-Run Setup Wizard** will guide you through:
   - Setting your cinema instance name.
   - Verifying system toolchains (FFmpeg, yt-dlp, aria2).
   - Creating your root administrator credentials with local bcrypt encryption.
   - Configuring login policies and modules.

---

## 🌐 Custom Domain & Automatic HTTPS (Optional)

If you have a domain pointing to your OCI Public IP (e.g. `watch.yourdomain.com`):

1. Edit `.env` on your server:
   ```bash
   nano .env
   ```
2. Set:
   ```ini
   CADDY_DOMAIN=watch.yourdomain.com
   CADDY_EMAIL=your-email@example.com
   ```
3. Restart Caddy:
   ```bash
   sudo docker compose restart caddy
   ```
   *Caddy will automatically provision a free SSL certificate from Let's Encrypt with zero manual configuration.*

---

## 🛠️ Handy Server Management Commands

- **View Live Logs**:
  ```bash
  sudo docker compose logs -f watch-together
  ```
- **View LiveKit Voice Logs**:
  ```bash
  sudo docker compose logs -f livekit
  ```
- **Restart All Services**:
  ```bash
  sudo docker compose restart
  ```
- **Update to a New Version**:
  Upload new `watch-together-oci.tar.gz` and run:
  ```bash
  tar -xzvf watch-together-oci.tar.gz -C watch-together
  cd watch-together && sudo docker compose up -d --build
  ```

