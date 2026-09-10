/**
 * PatientRepository.js
 * SQLite repository for patients table.
 * Source of truth for patient profile and caregiver-controlled settings.
 */

import { dbQuery, dbRun } from '../db';

export class PatientRepository {
  async getPatient(id) {
    if (!id) return null;
    const rows = await dbQuery('SELECT * FROM patients WHERE id = ?', [id]);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  async listPatients() {
    return await dbQuery('SELECT * FROM patients ORDER BY updated_at DESC');
  }

  async upsertPatient(patientData) {
    const id = patientData.id || patientData.patient_id;
    if (!id) throw new Error('Patient ID is required');

    const now = new Date().toISOString();
    const existing = await this.getPatient(id);

    if (existing) {
      const sql = `
        UPDATE patients SET
          name = ?,
          preferred_language = ?,
          caregiver_max_difficulty = ?,
          phone = ?,
          state = ?,
          age = ?,
          emergency_contact = ?,
          emergency_phone = ?,
          updated_at = ?,
          sync_status = 'pending'
        WHERE id = ?
      `;

      const values = [
        patientData.name ?? existing.name,
        patientData.preferred_language || patientData.language || existing.preferred_language || 'en',
        patientData.caregiver_max_difficulty != null ? Number(patientData.caregiver_max_difficulty) : existing.caregiver_max_difficulty,
        patientData.phone ?? existing.phone,
        patientData.state ?? existing.state,
        patientData.age != null ? Number(patientData.age) : existing.age,
        patientData.emergency_contact || patientData.emergencyContact || existing.emergency_contact,
        patientData.emergency_phone || patientData.emergencyPhone || existing.emergency_phone,
        now,
        id
      ];

      await dbRun(sql, values);
      return await this.getPatient(id);
    } else {
      const sql = `
        INSERT INTO patients (
          id, name, preferred_language, caregiver_max_difficulty,
          phone, state, age, emergency_contact, emergency_phone,
          created_at, updated_at, server_version, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        id,
        patientData.name || 'Patient',
        patientData.preferred_language || patientData.language || 'en',
        patientData.caregiver_max_difficulty != null ? Number(patientData.caregiver_max_difficulty) : 5,
        patientData.phone || '',
        patientData.state || '',
        patientData.age != null ? Number(patientData.age) : 0,
        patientData.emergency_contact || patientData.emergencyContact || '',
        patientData.emergency_phone || patientData.emergencyPhone || '',
        patientData.created_at || now,
        now,
        patientData.server_version != null ? Number(patientData.server_version) : 0,
        patientData.sync_status || 'pending'
      ];

      await dbRun(sql, values);
      return await this.getPatient(id);
    }
  }

  async updateCaregiverMaxDifficulty(id, maxDifficulty) {
    const level = Math.max(1, Math.min(5, Number(maxDifficulty) || 5));
    const now = new Date().toISOString();
    await dbRun(
      `UPDATE patients SET caregiver_max_difficulty = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
      [level, now, id]
    );
    return level;
  }

  async markSynced(id, serverVersion = 1) {
    const now = new Date().toISOString();
    return await dbRun(
      `UPDATE patients SET sync_status = 'synced', server_version = ?, updated_at = ? WHERE id = ?`,
      [serverVersion, now, id]
    );
  }

  /**
   * Conflict handling for patient profiles:
   * Uses server-controlled versions.
   * Prefer the server value for caregiver-controlled fields such as maximum difficulty.
   * Does not silently overwrite caregiver changes.
   */
  async applyServerPatient(serverPatient) {
    const id = serverPatient.id;
    const existing = await this.getPatient(id);
    const now = new Date().toISOString();

    if (!existing) {
      await dbRun(
        `INSERT INTO patients (
          id, name, preferred_language, caregiver_max_difficulty,
          phone, state, age, emergency_contact, emergency_phone,
          created_at, updated_at, server_version, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
        [
          serverPatient.id,
          serverPatient.name,
          serverPatient.preferred_language || 'en',
          Number(serverPatient.caregiver_max_difficulty) || 5,
          serverPatient.phone || '',
          serverPatient.state || '',
          Number(serverPatient.age) || 0,
          serverPatient.emergency_contact || '',
          serverPatient.emergency_phone || '',
          serverPatient.created_at || now,
          serverPatient.updated_at || now,
          Number(serverPatient.server_version) || 1
        ]
      );
      return;
    }

    // Conflict resolution
    const serverVer = Number(serverPatient.server_version) || 0;
    const localVer = Number(existing.server_version) || 0;

    if (serverVer > localVer) {
      if (existing.sync_status === 'pending') {
        console.warn(`[PatientRepository] Conflict on patient ${id}: Server v${serverVer} > Local v${localVer}. Preferring server caregiver settings.`);
      }

      await dbRun(
        `UPDATE patients SET
          name = ?,
          preferred_language = ?,
          caregiver_max_difficulty = ?,
          phone = ?,
          state = ?,
          age = ?,
          emergency_contact = ?,
          emergency_phone = ?,
          server_version = ?,
          sync_status = 'synced',
          updated_at = ?
        WHERE id = ?`,
        [
          serverPatient.name || existing.name,
          serverPatient.preferred_language || existing.preferred_language,
          Number(serverPatient.caregiver_max_difficulty) || existing.caregiver_max_difficulty,
          serverPatient.phone || existing.phone,
          serverPatient.state || existing.state,
          serverPatient.age != null ? Number(serverPatient.age) : existing.age,
          serverPatient.emergency_contact || existing.emergency_contact,
          serverPatient.emergency_phone || existing.emergency_phone,
          serverVer,
          now,
          id
        ]
      );
    }
  }
}

export const patientRepository = new PatientRepository();
export default patientRepository;
