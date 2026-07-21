require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

let db = null;
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();
} catch(e) { console.error('Firebase error:', e.message); }

app.get('/', (req, res) => res.json({ status: 'marks-api' }));

// ===== СТАТИСТИКА ПО ТАНКУ =====
app.get('/api/player/:accountId/tank-stats/:tankId', async (req, res) => {
  if (!db) return res.json({ last_total_damage: 0, battles_count: 0, battles: [] });
  try {
    const doc = await db.collection('tankStats')
      .doc(req.params.accountId).collection('tanks')
      .doc(req.params.tankId).get();
    res.json(doc.exists ? doc.data() : { last_total_damage: 0, battles_count: 0, battles: [] });
  } catch(e) { res.json({ last_total_damage: 0, battles_count: 0, battles: [] }); }
});

app.post('/api/player/:accountId/tank-stats/:tankId', async (req, res) => {
  if (!db) return res.json({ success: false });
  try {
    const { accountId, tankId } = req.params;
    const { last_total_damage, battles_count, new_battles } = req.body;
    const tankRef = db.collection('tankStats').doc(accountId).collection('tanks').doc(tankId);
    
    await tankRef.set({
      last_total_damage, battles_count,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    if (new_battles?.length > 0) {
      const currentDoc = await tankRef.get();
      const currentBattles = currentDoc.exists && currentDoc.data().battles ? currentDoc.data().battles : [];
      const updatedBattles = [...currentBattles, ...new_battles].slice(-100);
      await tankRef.update({ battles: updatedBattles });
    }
    
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ЕЖЕДНЕВНАЯ СТАТИСТИКА =====
app.post('/api/player/:accountId/daily-stats', async (req, res) => {
  if (!db) return res.json({ success: false });
  try {
    const now = new Date();
    const mskTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    const dateKey = mskTime.toISOString().split('T')[0];
    
    await db.collection('dailyStats').doc(req.params.accountId)
      .collection('snapshots').doc(dateKey).set({
        ...req.body.stats,
        date: dateKey,
        savedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    res.json({ success: true, date: dateKey });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/player/:accountId/daily-stats', async (req, res) => {
  if (!db) return res.json({ snapshots: [] });
  try {
    const { days = 30 } = req.query;
    const now = new Date();
    const mskTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    mskTime.setDate(mskTime.getDate() - parseInt(days));
    const fromDate = mskTime.toISOString().split('T')[0];
    
    const snapshot = await db.collection('dailyStats').doc(req.params.accountId)
      .collection('snapshots').where('date', '>=', fromDate).orderBy('date', 'asc').get();
    const snapshots = [];
    snapshot.forEach(doc => snapshots.push(doc.data()));
    res.json({ snapshots });
  } catch(e) { res.json({ snapshots: [] }); }
});

app.get('/api/player/:accountId/daily-stats/today', async (req, res) => {
  if (!db) return res.json({ exists: false });
  try {
    const now = new Date();
    const mskTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    const today = mskTime.toISOString().split('T')[0];
    const doc = await db.collection('dailyStats').doc(req.params.accountId)
      .collection('snapshots').doc(today).get();
    res.json({ exists: doc.exists, date: today });
  } catch(e) { res.json({ exists: false }); }
});

setInterval(() => {
  require('https').get(process.env.RENDER_EXTERNAL_URL + '/', () => {});
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => console.log(`✅ MARKS:${PORT}`));
