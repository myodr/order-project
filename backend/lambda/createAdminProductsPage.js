const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: 'ap-northeast-2' });
const PRODUCTS_TABLE = 'ProductsTable';

exports.handler = async (event) => {
  const sellerId = event.queryStringParameters?.sellerId || '';
  if (!sellerId) {
    return { statusCode: 400, body: 'sellerId 파라미터가 필요합니다.' };
  }

  // 상품 목록 조회
  let products = [];
  try {
    const res = await dynamoDb.query({
      TableName: PRODUCTS_TABLE,
      IndexName: 'sellerId-index',
      KeyConditionExpression: 'sellerId = :sid',
      ExpressionAttributeValues: { ':sid': sellerId }
    }).promise();
    // isActive !== false인 상품만 표시
    products = (res.Items || []).filter(p => p.isActive !== false);
  } catch (e) {
    return { statusCode: 500, body: '상품 조회 오류' };
  }

  console.log("products", products, sellerId);

  // HTML 랜더링
  const html = `
  <!DOCTYPE html>
  <html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>상품 관리</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
    <style>
      body { font-family: 'IBM Plex Sans KR', sans-serif; background: #f8f9fa; }
      .products-box { max-width: 900px; margin: 40px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px #0001; padding: 2.5rem 2rem; }
      .form-label { font-weight: bold; }
      .back-btn { position: absolute; top: 20px; left: 20px; }
      th, td { vertical-align: middle !important; }
    </style>
  </head>
  <body>
    <a href="/admin?sellerId=${sellerId}" class="btn btn-outline-secondary back-btn">← 뒤로가기</a>
    <div class="products-box">
      <h4 class="text-center mb-4">상품 통합 관리</h4>
      <form id="productsForm">
        <table class="table table-bordered align-middle">
          <thead class="table-light">
            <tr>
              <th>상품명</th>
              <th>공급처</th>
              <th>공급가(원)</th>
              <th>판매가(원)</th>
              <th>재고</th>
              <th>썸네일</th>
              <th>삭제</th>
            </tr>
          </thead>
          <tbody id="productsTbody">
            ${
              products.length === 0
                ? `<tr id="emptyRow"><td colspan="7" class="text-center text-muted">등록된 상품이 없습니다.</td></tr>`
                : products.map((p, idx) => `
                  <tr>
                    <td><input type="hidden" name="productId${idx}" value="${p.productId || ''}" />
                        <input type="text" class="form-control" name="productName${idx}" value="${p.productName || ''}" required /></td>
                    <td><input type="text" class="form-control" name="supplier${idx}" value="${p.supplier || ''}" /></td>
                    <td><input type="number" class="form-control" name="supplyPrice${idx}" value="${p.supplyPrice || ''}" min="0" /></td>
                    <td><input type="number" class="form-control" name="basePrice${idx}" value="${p.basePrice || ''}" min="0" required /></td>
                    <td><input type="number" class="form-control" name="stock${idx}" value="${p.stock || 0}" min="0" /></td>
                    <td>
                      <img src="${p.imageUrl || ''}" alt="썸네일" style="max-width:60px; max-height:60px;" id="thumbPreview${idx}" />
                      <input type="file" accept="image/*" class="form-control mt-1" onchange="uploadThumbnail(this, ${idx})" />
                      <input type="text" class="form-control mt-1" name="imageUrl${idx}" value="${p.imageUrl || ''}" placeholder="이미지 URL" />
                    </td>
                    <td><button type="button" class="btn btn-danger btn-sm" onclick="deleteRow(this)">삭제</button></td>
                  </tr>
                `).join('')
            }
            <tr id="addRowTr">
              <td colspan="7" class="text-center">
                <button type="button" class="btn btn-outline-primary" onclick="addRow()">+ 상품 추가</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="d-grid mt-4">
          <button type="submit" class="btn btn-success">저장</button>
        </div>
      </form>
      <div id="resultMsg" class="mt-3 text-center"></div>
    </div>
    <script>
    window.deletedProductIds = [];
    function deleteRow(btn) {
      const tr = btn.closest('tr');
      const productIdInput = tr.querySelector('[name^=productId]');
      if (productIdInput && productIdInput.value) {
        window.deletedProductIds.push(productIdInput.value);
      }
      tr.remove();
    }
    function addRow() {
      const tbody = document.getElementById('productsTbody');
      // 가장 큰 idx 계산
      const idxList = Array.from(tbody.querySelectorAll('input[name^=productName]'))
        .map(input => parseInt(input.name.replace('productName', '')))
        .filter(n => !isNaN(n));
      const idx = idxList.length > 0 ? Math.max(...idxList) + 1 : 0;

      // 빈 안내 행 삭제
      const emptyRow = document.getElementById('emptyRow');
      if (emptyRow) emptyRow.remove();

      const tr = document.createElement('tr');
      tr.innerHTML = \`<td><input type="hidden" name="productId\${idx}" />
          <input type="text" class="form-control" name="productName\${idx}" required /></td>
        <td><input type="text" class="form-control" name="supplier\${idx}" /></td>
        <td><input type="number" class="form-control" name="supplyPrice\${idx}" min="0" /></td>
        <td><input type="number" class="form-control" name="basePrice\${idx}" min="0" required /></td>
        <td><input type="number" class="form-control" name="stock\${idx}" min="0" /></td>
        <td>
          <img src="" alt="썸네일" style="max-width:60px; max-height:60px; display:none;" id="thumbPreview\${idx}" />
          <input type="file" accept="image/*" class="form-control mt-1" onchange="uploadThumbnail(this, \${idx})" />
          <input type="text" class="form-control mt-1" name="imageUrl\${idx}" placeholder="이미지 URL" />
        </td>
        <td><button type="button" class="btn btn-danger btn-sm" onclick="deleteRow(this)">삭제</button></td>\`;
      tbody.insertBefore(tr, document.getElementById('addRowTr'));
    }
    async function uploadThumbnail(input, idx) {
      const file = input.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/admin/uploadImage", {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        const imageUrl = data.url;
        document.querySelector(\`input[name="imageUrl\${idx}"]\`).value = imageUrl;
        const preview = document.getElementById(\`thumbPreview\${idx}\`);
        if (preview) {
          preview.src = imageUrl;
          preview.style.display = "block";
        }
      } else {
        alert("이미지 업로드에 실패했습니다.");
      }
    }
    document.getElementById('productsForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      const form = e.target;
      const rows = Array.from(form.querySelectorAll('tbody tr')).filter(tr => !tr.id);
      const products = rows.map((tr, idx) => ({
        sellerId: '${sellerId}',
        productId: tr.querySelector(\`[name^=productId]\`)?.value || undefined,
        productName: tr.querySelector(\`[name^=productName]\`).value,
        supplier: tr.querySelector(\`[name^=supplier]\`).value,
        supplyPrice: parseInt(tr.querySelector(\`[name^=supplyPrice]\`).value) || 0,
        basePrice: parseInt(tr.querySelector(\`[name^=basePrice]\`).value) || 0,
        stock: parseInt(tr.querySelector(\`[name^=stock]\`).value) || 0,
        imageUrl: tr.querySelector(\`[name^=imageUrl]\`).value
      }));
      const payload = {
        products,
        deletedProductIds: window.deletedProductIds
      };
      const res = await fetch('/admin/products/save?sellerId=${sellerId}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const msg = document.getElementById('resultMsg');
      if (res.ok) {
        msg.innerText = '저장되었습니다.';
        msg.className = 'mt-3 text-center text-success';
        window.deletedProductIds = [];
      } else {
        msg.innerText = '저장 실패';
        msg.className = 'mt-3 text-center text-danger';
      }
    });
    </script>
  </body>
  </html>
  `;
  return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: html };
}; 