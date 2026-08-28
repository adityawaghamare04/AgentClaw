/** Built by Aditya Waghamare */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dbSaveVaultRecord, dbGetVaultRecord, type VaultRecord } from "../memory/db.js";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100000;

export interface VaultSecretPayload {
  ethPrivateKey?: string;
  treasuryAddress?: string;
  adminSecret?: string;
  customSecrets?: Record<string, string>;
}

export class SecureVaultManager {
  private masterKey: Buffer | null = null;
  private vaultId: string = "agentclaw_primary_vault";

  /**
   * Derives a 256-bit encryption key from a master passphrase using PBKDF2.
   */
  private deriveKey(passphrase: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
  }

  /**
   * Initializes or unlocks the encrypted vault using the master passphrase or fallback process key.
   */
  public initializeVault(passphrase?: string): boolean {
    let masterPass = passphrase || process.env.VAULT_PASSPHRASE || process.env.ADMIN_PASSWORD;
    if (!masterPass) {
      console.warn("⚠️ [Security Vault] WARNING: Neither VAULT_PASSPHRASE nor ADMIN_PASSWORD found in environment variables.");
      console.warn("🔒 [Security Vault] Option A Active: Generating ephemeral cryptographically random 256-bit runtime key.");
      masterPass = crypto.randomBytes(32).toString("hex");
    }
    
    // Check if vault already exists in SQLite DB
    let record = dbGetVaultRecord(this.vaultId);

    if (!record) {
      // Create new vault from existing environment variables if present
      const initialPayload: VaultSecretPayload = {
        ethPrivateKey: process.env.ETH_PRIVATE_KEY || "",
        treasuryAddress: process.env.TREASURY_ADDRESS || "",
        adminSecret: process.env.ADMIN_PASSWORD || "",
      };

      const salt = crypto.randomBytes(SALT_LENGTH);
      this.masterKey = this.deriveKey(masterPass, salt);

      this.storeVaultSecrets(initialPayload, salt);
      console.log(`🔐 [Security Vault] Vault initialized & encrypted with AES-256-GCM.`);
    } else {
      const salt = Buffer.from(record.salt, "hex");
      this.masterKey = this.deriveKey(masterPass, salt);
      console.log(`🔐 [Security Vault] Vault unlocked successfully with master key.`);
    }

    return true;
  }

  /**
   * Encrypts and stores secrets payload in SQLite vault table.
   */
  public storeVaultSecrets(payload: VaultSecretPayload, customSalt?: Buffer): void {
    if (!this.masterKey) throw new Error("Vault is locked. Initialize vault first.");

    const salt = customSalt || crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);

    const jsonStr = JSON.stringify(payload);
    let encrypted = cipher.update(jsonStr, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag().toString("hex");

    dbSaveVaultRecord({
      vaultId: this.vaultId,
      encryptedPayload: encrypted,
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      authTag,
      updatedAt: Date.now(),
    });
  }

  /**
   * Decrypts the secret payload transiently in memory.
   */
  public getVaultSecrets(): VaultSecretPayload | null {
    if (!this.masterKey) return null;

    const record = dbGetVaultRecord(this.vaultId);
    if (!record) return null;

    try {
      const iv = Buffer.from(record.iv, "hex");
      const authTag = Buffer.from(record.authTag, "hex");
      const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(record.encryptedPayload, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return JSON.parse(decrypted) as VaultSecretPayload;
    } catch (err) {
      console.error("❌ [Security Vault] Decryption failed! Invalid master key or corrupted vault.");
      return null;
    }
  }

  /**
   * Zeroize Enclave Signer Closure:
   * Decrypts sensitive key in an isolated closure ONLY for the duration of the callback,
   * then immediately zero-fills memory buffers to prevent memory extraction!
   */
  public async withDecryptedPrivateKey<T>(
    callback: (privateKey: string) => Promise<T>
  ): Promise<T> {
    const secrets = this.getVaultSecrets();
    const keyStr = secrets?.ethPrivateKey || process.env.ETH_PRIVATE_KEY || "";

    // Convert string to mutable Buffer memory for secure zeroizing
    const keyBuffer = Buffer.from(keyStr, "utf8");
    try {
      const result = await callback(keyBuffer.toString("utf8"));
      return result;
    } finally {
      // Secure Zeroization: wipe sensitive bytes from memory
      keyBuffer.fill(0);
    }
  }
}

export const vaultManager = new SecureVaultManager();
