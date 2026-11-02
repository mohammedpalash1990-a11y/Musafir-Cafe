'use strict';
// Private key, certificate token and API secret live ONLY in Google Secret Manager.
const ID = /^[A-Za-z0-9_-]{1,255}$/;
const secretId = (uid, env, kind) => { const id = `zatca-${uid}-${env}-${kind}`; if (!ID.test(id)) throw new Error('Bad secret id'); return id; };
function createSecretStore(client, projectId) {
  const parent = `projects/${projectId}`;
  return {
    async save(uid, env, kind, value) {
      const id = secretId(uid, env, kind);
      try { await client.createSecret({ parent, secretId: id, secret: { replication: { automatic: {} } } }); }
      catch (e) { if (!(e && (e.code === 6 || /ALREADY_EXISTS/.test(String(e.message))))) throw e; }
      await client.addSecretVersion({ parent: `${parent}/secrets/${id}`, payload: { data: Buffer.from(value, 'utf8') } });
    },
    async get(uid, env, kind) {
      const id = secretId(uid, env, kind);
      try { const [v] = await client.accessSecretVersion({ name: `${parent}/secrets/${id}/versions/latest` }); return v.payload.data.toString('utf8'); }
      catch (e) { if (e && (e.code === 5 || /NOT_FOUND/.test(String(e.message)))) return null; throw e; }
    },
  };
}
module.exports = { createSecretStore, secretId };
