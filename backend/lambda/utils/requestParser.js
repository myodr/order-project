// utils/requestParser.js

function parseRequestBody(event) {
    const headers = normalizeHeaders(event.headers);
    const contentType = headers['content-type'] || '';
    const isBase64 = event.isBase64Encoded === true;

    // 1. multipart/form-data → binary Buffer
    if (contentType.includes('multipart/form-data')) {
        const buffer = isBase64
            ? Buffer.from(event.body, 'base64')
            : Buffer.from(event.body);
        return { type: 'multipart', body: buffer };
    }

    // 2. application/x-www-form-urlencoded → key-value 객체
    if (contentType.includes('application/x-www-form-urlencoded')) {
        const decoded = isBase64
            ? Buffer.from(event.body, 'base64').toString()
            : event.body;
        return { type: 'form', body: parseFormString(decoded) };
    }

    // 3. application/json → JSON 객체
    if (contentType.includes('application/json')) {
        const jsonStr = isBase64
            ? Buffer.from(event.body, 'base64').toString()
            : event.body;
        try {
            return { type: 'json', body: JSON.parse(jsonStr) };
        } catch (err) {
            console.error("❗ JSON parse error:", err.message);
            return { type: 'json', body: null };
        }
    }

    // 4. 기타 → raw string
    return {
        type: 'raw',
        body: isBase64 ? Buffer.from(event.body, 'base64').toString() : event.body
    };
}

// 🔹 URL-encoded string → key-value object
function parseFormString(str) {
    const params = new URLSearchParams(str);
    const result = {};
    for (const [key, value] of params.entries()) {
        result[key] = value;
    }
    return result;
}

// 🔹 Header 키를 소문자로 정리 (대소문자 혼용 방지용)
function normalizeHeaders(headers = {}) {
    const normalized = {};
    for (const key in headers) {
        normalized[key.toLowerCase()] = headers[key];
    }
    return normalized;
}

module.exports = {
    parseRequestBody
};
