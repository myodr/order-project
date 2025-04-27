const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "ap-northeast-2" });

const PRODUCTS_TABLE = "ProductsTable";

exports.handler = async (event) => {
    const sellerId = event.queryStringParameters?.sellerId;

    if (!sellerId) {
        return {
            statusCode: 400,
            headers: { "Content-Type": "text/html" },
            body: `<h3>sellerId가 누락되었습니다.</h3>`
        };
    }

    // 판매자별 상품 조회
    const productsResult = await dynamoDb.query({
        TableName: PRODUCTS_TABLE,
        IndexName: "sellerId-index",
        KeyConditionExpression: "sellerId = :sid",
        ExpressionAttributeValues: {
            ":sid": sellerId
        }
    }).promise();

    const products = productsResult.Items || [];

    // 상품목록을 JavaScript로 주입
    const productsJson = JSON.stringify(products);

    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>주문 생성</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <style>
    body { font-family: 'IBM Plex Sans KR', sans-serif; padding: 2rem; }
    .product-entry { margin-bottom: 1rem; }
  </style>
</head>
<body>

<h3 class="mb-4">상품 주문</h3>

<form id="eventForm" enctype="multipart/form-data" method="POST" action="/admin/createEvent">
  <div class="mb-3">
    <label class="form-label">이벤트 제목</label>
    <input type="text" name="title" class="form-control" required />
  </div>

  <div class="mb-3">
    <label class="form-label">이벤트 시작일</label>
    <input type="date" name="startDate" class="form-control" required />
    <div class="d-flex gap-2 mt-2">
      <select name="startHour" class="form-select w-auto" required>
        ${Array.from({ length: 24 }, (_, i) => `<option value="${i}">${i}시</option>`).join('')}
      </select>
      <select name="startMinute" class="form-select w-auto" required>
        ${[0,10,20,30,40,50].map(min => `<option value="${min}">${min}분</option>`).join('')}
      </select>
    </div>
  </div>

  <div class="mb-3">
    <label class="form-label">이벤트 종료일</label>
    <input type="date" name="endDate" class="form-control" required />
    <div class="d-flex gap-2 mt-2">
      <select name="endHour" class="form-select w-auto" required>
        ${Array.from({ length: 24 }, (_, i) => `<option value="${i}">${i}시</option>`).join('')}
      </select>
      <select name="endMinute" class="form-select w-auto" required>
        ${[0,10,20,30,40,50].map(min => `<option value="${min}">${min}분</option>`).join('')}
      </select>
    </div>
  </div>

  <div class="mb-3">
    <label class="form-label">이벤트 설명</label>
    <textarea name="description" class="form-control" rows="3" required></textarea>
  </div>

  <div class="mb-3">
    <label class="form-label">입금 은행 계좌번호</label>
    <input type="text" name="payAccount" class="form-control" required />
  </div>

  <div class="mb-3">
    <label class="form-label">입금 은행 예금주</label>
    <input type="text" name="payAccountOwner" class="form-control" required />
  </div>

  <div id="productsArea"></div>
  

  <div class="d-grid mb-3">
    <button type="button" class="btn btn-outline-primary" onclick="addProduct()">상품 추가 (+)</button>
  </div>

  <div class="d-grid">
    <button type="submit" class="btn btn-primary">주문 생성</button>
  </div>
</form>
<!-- 📦 중복선택 경고 모달 -->
<div class="modal fade" id="duplicateModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-sm modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header bg-danger text-white py-2">
        <h5 class="modal-title">상품 선택 오류</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body text-center">
        동일한 상품을 중복 선택할 수 없습니다.
      </div>
      <div class="modal-footer py-2 justify-content-center">
        <button type="button" class="btn btn-danger btn-sm" data-bs-dismiss="modal">확인</button>
      </div>
    </div>
  </div>
</div>

<script>
const products = ${productsJson};  // 🔥 DynamoDB 상품 목록 주입
let productCount = 0;

function addProduct() {
  if (productCount >= 10) {
    alert("최대 10개의 상품만 추가할 수 있습니다.");
    return;
  }

  const productsArea = document.getElementById("productsArea");

  const productOptions = products.map(p => 
  \`<option value="\${p.productId}" 
           data-name="\${p.name}" 
           data-price="\${p.basePrice}" 
           data-thumbnail="\${p.imageUrl || ''}">
    \${p.name}
  </option>\`
).join('');

  const entry = \`
    <div class="product-entry border p-3 rounded" id="product-entry-\${productCount}">
      <button type="button" class="btn btn-sm btn-danger delete-btn" onclick="deleteProduct(\${productCount})">X</button>

      <h6>상품 \${productCount + 1}</h6>

      <div class="mb-2">
        <label class="form-label">상품 선택</label>
        <select name="productSelect\${productCount}" class="form-select" onchange="toggleProductInput(this, \${productCount})">
          <option value="">[신규 등록]</option>
          \${productOptions}
        </select>
      </div>

      <div id="newProductArea\${productCount}">
        <div class="mb-2">
          <label class="form-label">상품 썸네일</label>
          <input type="file" name="thumbnail\${productCount}" accept="image/*" class="form-control" />
        </div>

        <div class="mb-2">
          <label class="form-label">상품명</label>
          <input type="text" name="productName\${productCount}" class="form-control" />
        </div>
      </div>

      <div class="mb-2">
        <label class="form-label">단가 (₩)</label>
        <input type="number" name="unitPrice$\{productCount}" class="form-control" required />
      </div>

      <div class="mb-2">
        <label class="form-label">수량</label>
        <input type="number" name="stock\${productCount}" class="form-control" value="1" min="1" required />
      </div>
    </div>
  \`;
  
  productsArea.insertAdjacentHTML('beforeend', entry);
  productCount++;
}
//
// function onProductChange(select, idx) {
//   const selectedOption = select.options[select.selectedIndex];
//   const unitPriceInput = document.querySelector(\`input[name="unitPrice\${idx}"]\`);
//
//   if (selectedOption.value) {
//     unitPriceInput.value = selectedOption.dataset.price;
//   } else {
//     unitPriceInput.value = "";
//   }
// }


// ✅ 현재 선택된 상품 중복 체크
function isDuplicateSelection(selectedValue, currentIdx) {
  const selects = document.querySelectorAll('select[name^="productSelect"]');
  let selectedValues = [];

  selects.forEach((sel, idx) => {
    if (idx !== currentIdx && sel.value) {
      selectedValues.push(sel.value);
    }
  });

  return selectedValues.includes(selectedValue);
}


function toggleProductInput(select, idx) {
  const newArea = document.getElementById(\`newProductArea\${idx}\`);
  const unitPriceInput = document.querySelector(\`input[name = "unitPrice\${idx}"]\`);
  const productNameInput = document.querySelector(\`input[name = "productName\${idx}"]\`);
  const thumbnailInput = document.querySelector(\`input[name = "thumbnail\${idx}"]\`);
  const selectedOption = select.options[select.selectedIndex];
  
  const selectedValue = select.value;
  
  if (selectedValue && isDuplicateSelection(selectedValue, idx)) {
    // ❗ 중복 상품 선택 → 모달 경고
    const modal = new bootstrap.Modal(document.getElementById("duplicateModal"));
    modal.show();

    // 선택 취소 (기존 선택 무효화)
    select.value = "";

    if (newArea) newArea.style.display = "block";
    if (productNameInput) productNameInput.value = "";
    if (unitPriceInput) unitPriceInput.value = "";
    if (thumbnailInput) thumbnailInput.disabled = false;

    return;
  }

  if (select.value) {
    // 기존 상품 선택
    productNameInput.value = selectedOption.dataset.name;
    unitPriceInput.value = selectedOption.dataset.price;
    thumbnailInput.disabled = true;
    newArea.style.display = "none";

    // ✅ thumbnailUrl을 hidden input에 저장할 수도 있음 (선택)
    const hiddenThumbnailUrlInputName = \`thumbnailUrl\${idx}\`;
    let hiddenInput = document.querySelector(\`input[name="\${hiddenThumbnailUrlInputName}"]\`);
    if (!hiddenInput) {
      hiddenInput = document.createElement('input');
      hiddenInput.type = "hidden";
      hiddenInput.name = hiddenThumbnailUrlInputName;
      document.getElementById(\`product-entry-\${idx}\`).appendChild(hiddenInput);
    }
    hiddenInput.value = selectedOption.dataset.thumbnail || "";
  } else {
    // 신규 등록
    productNameInput.value = "";
    unitPriceInput.value = "";
    thumbnailInput.disabled = false;
    newArea.style.display = "block";
  }
}

function deleteProduct(idx) {
  const entry = document.getElementById(\`product-entry-\${idx}\`);
  if (entry) {
    entry.remove();
  }
}
</script>

</body>
</html>
`;

    return {
        statusCode: 200,
        headers: { "Content-Type": "text/html" },
        body: html
    };
};
