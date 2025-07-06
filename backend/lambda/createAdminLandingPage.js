exports.handler = async (event) => {
  // sellerId 파라미터 추출
  const sellerId = event.queryStringParameters?.sellerId || '';
  const sellerParam = sellerId ? `?sellerId=${encodeURIComponent(sellerId)}` : '';

  const html = `
  <!DOCTYPE html>
  <html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>판매자 관리자 페이지</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
    <style>
      body { font-family: 'IBM Plex Sans KR', sans-serif; background: #f8f9fa; }
      .admin-nav { max-width: 480px; margin: 60px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px #0001; padding: 2.5rem 2rem; }
      .admin-nav .btn { width: 100%; margin-bottom: 1.2rem; font-size: 1.1em; font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="admin-nav">
      <h4 class="text-center mb-4">판매자 관리자</h4>
      <a href="/admin/profile${sellerParam}" class="btn btn-outline-primary">My Profile</a>
      <a href="/admin/products${sellerParam}" class="btn btn-outline-success">상품관리</a>
      <a href="/admin/events${sellerParam}" class="btn btn-outline-info">주문서 목록</a>
      <a href="/admin/notices${sellerParam}" class="btn btn-outline-warning">공지사항 관리</a>
      <div class="text-center mt-4 text-secondary" style="font-size:0.95em;">관리자 전용 메뉴입니다.</div>
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