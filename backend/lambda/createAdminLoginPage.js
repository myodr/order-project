const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID || 'YOUR_KAKAO_CLIENT_ID';
const REDIRECT_URI = process.env.ADMIN_OAUTH_REDIRECT_URI || 'https://yourdomain.com/admin/oauth/callback';

exports.handler = async (event) => {
    const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8" />
      <title>관리자 소셜 로그인</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
      <style>
        body { font-family: 'IBM Plex Sans KR', sans-serif; background: #f8f9fa; }
        .login-box { max-width: 400px; margin: 60px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px #0001; padding: 2.5rem 2rem; }
        .social-btn { width: 100%; margin-bottom: 1rem; font-weight: bold; font-size: 1.1em; }
        .kakao { background: #fee500; color: #3c1e1e; border: none; }
      </style>
    </head>
    <body>
      <div class="login-box">
        <h4 class="text-center mb-4">관리자 소셜 로그인</h4>
        <a href="https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code" class="btn social-btn kakao mb-2">카카오로 로그인</a>
        <div class="text-center mt-4 text-secondary" style="font-size:0.95em;">관리자만 접근 가능합니다.</div>
      </div>
    </body>
    </html>
    `;
    return {
        statusCode: 200,
        headers: { "Content-Type": "text/html" },
        body: html
    };
}; 