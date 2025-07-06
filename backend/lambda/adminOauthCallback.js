// backend/lambda/adminOauthCallback.js
const axios = require('axios');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const REDIRECT_AFTER_LOGIN = '/admin';
const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID;
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET;
const REDIRECT_URI = process.env.ADMIN_OAUTH_REDIRECT_URI;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'admin@yourdomain.com').split(',');

exports.handler = async (event) => {
  const { code } = event.queryStringParameters || {};

  try {
    // 1. 카카오 토큰 교환
    const tokenRes = await axios.post('https://kauth.kakao.com/oauth/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: KAKAO_CLIENT_ID,
        client_secret: KAKAO_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code
      }
    });
    const access_token = tokenRes.data.access_token;

    // 2. 카카오 사용자 정보 조회
    const userRes = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const kakaoAccount = userRes.data.kakao_account;
    const email = kakaoAccount.email;
    const name = kakaoAccount.profile?.nickname || '';

    // 3. 관리자 이메일 검증
    if (!email || !ADMIN_EMAILS.includes(email)) {
      return {
        statusCode: 302,
        headers: { Location: '/admin/login?error=unauthorized' },
        body: ''
      };
    }

    // 4. JWT 발급 및 쿠키 세팅
    const token = jwt.sign(
      { email, name, provider: 'kakao' },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    return {
      statusCode: 302,
      headers: {
        'Set-Cookie': `admin_token=${token}; HttpOnly; Secure; Path=/; SameSite=Lax`,
        'Location': REDIRECT_AFTER_LOGIN
      },
      body: ''
    };
  } catch (err) {
    return {
      statusCode: 302,
      headers: { Location: '/admin/login?error=oauth' },
      body: ''
    };
  }
};