# Windows installer & code signing

## Updating (no separate Repair button)

This installer does **not** show a Windows “Repair” option — that is normal for this type of app.

**To update** (new icon, fixes, etc.):

1. Run the latest **`Business One Support Desk.exe`** from Downloads again.
2. The wizard upgrades the existing install (version **1.0.1** or newer replaces **1.0.0**).
3. Your `hub-url.txt` in the install folder is **not** overwritten.

**If the installer refuses to run** (same version already installed):

- **Settings → Apps → Business One Support Desk → Uninstall**
- Then run the installer again

Or delete the desktop shortcut and create a new one from the Start Menu after updating.

## Standard Windows install (what technicians get)

Run **`build-installer.bat`** to produce:

`dist\Business One Support Desk.exe`

Double-click the setup file — normal install wizard:

- Choose install folder (default: `C:\Program Files\Business One Support Desk`)
- Start Menu shortcut
- Desktop shortcut (optional)
- **Apps & features** uninstall entry
- Outbound Windows Firewall rule (HTTPS / WebRTC to your support hub)
- `hub-url.example.txt` copied beside the installed app

After install, rename `hub-url.example.txt` → `hub-url.txt` and set your hub URL.

## Why Windows may still warn (SmartScreen / Defender)

Unsigned or new installers trigger **“Windows protected your PC”** until the app is **Authenticode signed** with a certificate from a trusted CA. Self-signed certs do **not** remove this.

### What you need (one-time business purchase)

1. **Windows code signing certificate** from a trusted CA, for example:
   - [DigiCert](https://www.digicert.com/signing/code-signing-certificates) — Standard or EV
   - [Sectigo](https://sectigo.com/ssl-certificates-tls/code-signing)
   - [SSL.com](https://www.ssl.com/code-signing/)
   - [Microsoft Azure Trusted Signing](https://azure.microsoft.com/products/trusted-signing) — cloud signing

2. **EV (Extended Validation)** — fastest path to SmartScreen trust (often immediate).  
   **Standard OV** — cheaper; reputation builds after enough installs (days–weeks).

3. Export the certificate as a **`.pfx`** file (includes private key).

### Configure signing for builds

```bat
copy signing.env.example signing.env
```

Edit `signing.env`:

```env
WIN_CSC_LINK=C:\certs\business-one-code-sign.pfx
CSC_KEY_PASSWORD=your-pfx-password
```

Never commit `signing.env` or `.pfx` files to git.

Run **`build-installer.bat`** again — the Setup.exe and the installed `.exe` are signed.

### Build machine note

If the build fails extracting signing tools, enable **Developer Mode** in Windows  
(Settings → System → For developers) or run the build terminal **as Administrator**.

### Optional — Microsoft reputation

After signing, submit the installer at [Microsoft Hardware Dev Center / SmartScreen](https://www.microsoft.com/en-us/wdsi/filesubmission) if warnings persist on new builds.

## Firewall

The installer adds an **outbound allow** rule named `Business One Support Desk`. The desk only makes outbound HTTPS/WebRTC connections to your hub and merchant stores — it does not open inbound ports. Uninstall removes the rule.

Strict corporate firewalls may still require IT to allow your hub domain.

## Portable build (no install)

```bat
npm run build:portable
```

Use the **Setup.exe** for production technician PCs.

## Developer test without signing

```bat
npm install
npm start
```

Or build unsigned installer (SmartScreen will warn):

```bat
build-installer.bat
```
