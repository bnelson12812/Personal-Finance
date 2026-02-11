/**
 * Finance Dashboard Configuration
 * ================================
 * IMPORTANT: Change your password before uploading to GitHub!
 *
 * To generate a new password hash:
 * 1. Open your browser console (F12)
 * 2. Paste this and press Enter (replace "yourpassword" with your actual password):
 *
 *    crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpassword'))
 *      .then(buf => console.log(Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')))
 *
 * 3. Copy the output and paste it as the passwordHash below.
 *
 * Default credentials:
 *   Username: admin
 *   Password: changeme123
 */

window.FINANCE_CONFIG = {
  username: "admin",

  // SHA-256 hash of "changeme123"
  // CHANGE THIS before uploading to GitHub!
  passwordHash: "494a715f7e9b4071aca61bac42ca858a309524e5864f0920030862a4ae7589be"
};
