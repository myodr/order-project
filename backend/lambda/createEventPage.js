const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "ap-northeast-2" });

const PRODUCTS_TABLE = "ProductsTable";
const EVENTS_TABLE = "EventsTable";

exports.handler = async (event) => {
    const sellerId = event.queryStringParameters?.sellerId;
    const token = event.queryStringParameters?.token;
    const eventId = event.queryStringParameters?.eventId;

    if (!sellerId) {
        return {
            statusCode: 400,
            headers: { "Content-Type": "text/html" },
            body: `<h3>sellerId가 누락되었습니다.</h3>`
        };
    }

    let existingEvent = null;
    let isEditMode = false;
    
    if (eventId) {
        try {
            const eventResult = await dynamoDb.get({
                TableName: EVENTS_TABLE,
                Key: { eventId }
            }).promise();
            
            existingEvent = eventResult.Item?.eventsFullManage;
            if (existingEvent && existingEvent.sellerId === sellerId) {
                isEditMode = true;
            }
        } catch (error) {
            console.error("이벤트 조회 오류:", error);
        }
    }

    const productsResult = await dynamoDb.query({
        TableName: PRODUCTS_TABLE,
        IndexName: "sellerId-index",
        KeyConditionExpression: "sellerId = :sid",
        ExpressionAttributeValues: {
            ":sid": sellerId
        }
    }).promise();

    const products = productsResult.Items || [];

    const productsJson = JSON.stringify(products);
    const existingEventJson = JSON.stringify(existingEvent);

    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>${isEditMode ? '이벤트 수정' : '주문 생성'}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script src="https://cdn.tiny.cloud/1/h8zwm20qo9yllrv50wszs3qel54vjb18kt5hnk5x3cjm559p/tinymce/6/tinymce.min.js" referrerpolicy="origin"></script>
  <style>
    body { font-family: 'IBM Plex Sans KR', sans-serif; padding: 2rem; }
    .product-entry { margin-bottom: 1rem; }
    .tox-tinymce { border: 1px solid #ced4da !important; border-radius: 0.375rem !important; }
    .tox .tox-toolbar { background-color: #f8f9fa !important; }
  </style>
</head>
<body>

<h3 class="mb-4">${isEditMode ? '이벤트 수정' : '상품 주문'}</h3>

<form id="eventForm" method="POST" action="/admin/createEvent">
<input type="hidden" name="sellerId" value="${sellerId}">
<input type="hidden" name="token" value="${token}">
${isEditMode ? `<input type="hidden" name="eventId" value="${eventId}">` : ''}
        
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
    <textarea name="description" class="form-control rich-editor" rows="4" style="min-height: 120px;" required></textarea>
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
    <button type="button" class="btn btn-primary" onclick="showConfirmModal()">${isEditMode ? '이벤트 수정' : '주문 생성'}</button>
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

<!-- ✅ 이벤트 생성 확인 모달 -->
<div class="modal fade" id="confirmSubmitModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">${isEditMode ? '이벤트 수정' : '이벤트 생성'} 확인</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body text-center">
        <p>이벤트를 ${isEditMode ? '수정' : '생성'}하시겠습니까?</p>
      </div>
      <div class="modal-footer justify-content-center">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">취소</button>
        <button type="button" class="btn btn-primary" onclick="submitForm()">확인</button>
      </div>
    </div>
  </div>
</div>

<script>
const products = ${productsJson};
const existingEvent = ${existingEventJson};
const isEditMode = ${isEditMode};
let productCount = 0;

console.log("products", products);
console.log("existingEvent", existingEvent);

document.addEventListener('DOMContentLoaded', function() {
    // 기존 데이터가 있으면 먼저 상품들을 추가한 후 TinyMCE 초기화
    if (isEditMode && existingEvent) {
        fillExistingEventData();
        // 상품 추가 후 TinyMCE 초기화
        setTimeout(() => {
            initializeTinyMCE();
        }, 500);
    } else {
        // 신규 생성인 경우 바로 TinyMCE 초기화
        setTimeout(() => {
            initializeTinyMCE();
        }, 100);
    }
});

function fillExistingEventData() {
    document.querySelector('input[name="title"]').value = existingEvent.title || '';
    document.querySelector('textarea[name="description"]').value = existingEvent.description || '';
    document.querySelector('input[name="payAccount"]').value = existingEvent.payAccount || '';
    document.querySelector('input[name="payAccountOwner"]').value = existingEvent.payAccountOwner || '';
    
    if (existingEvent.startTime) {
        const startDate = new Date(existingEvent.startTime);
        document.querySelector('input[name="startDate"]').value = startDate.toISOString().split('T')[0];
        document.querySelector('select[name="startHour"]').value = startDate.getUTCHours();
        document.querySelector('select[name="startMinute"]').value = startDate.getUTCMinutes();
    }
    
    if (existingEvent.endTime) {
        const endDate = new Date(existingEvent.endTime);
        document.querySelector('input[name="endDate"]').value = endDate.toISOString().split('T')[0];
        document.querySelector('select[name="endHour"]').value = endDate.getUTCHours();
        document.querySelector('select[name="endMinute"]').value = endDate.getUTCMinutes();
    }
    
    if (existingEvent.items && existingEvent.items.length > 0) {
        existingEvent.items.forEach((item, index) => {
            addProduct();
            // 상품 데이터 즉시 설정 (TinyMCE는 나중에 초기화됨)
            fillProductData(index, item);
        });
    }
}

function fillProductData(index, item) {
    const productEntry = document.getElementById('product-entry-' + index);
    if (!productEntry) return;
    
    const productSelect = productEntry.querySelector('select[name="productSelect' + index + '"]');
    if (item.productId) {
        const existingProduct = products.find(p => p.productId === item.productId);
        if (existingProduct) {
            productSelect.value = item.productId;
            toggleProductInput(productSelect, index);
        }
    }
    
    productEntry.querySelector('input[name="productName' + index + '"]').value = item.productName || '';
    
    // textarea에 내용 설정 (TinyMCE 초기화 전이므로 직접 설정)
    const descriptionTextarea = productEntry.querySelector('textarea[name="description' + index + '"]');
    if (descriptionTextarea) {
        descriptionTextarea.value = item.description || '';
    }
    
    productEntry.querySelector('input[name="unitPrice' + index + '"]').value = item.eventPrice || '';
    productEntry.querySelector('input[name="stock' + index + '"]').value = item.stock || 1;
    
    const thumbnailUrlInput = productEntry.querySelector('input[name="thumbnailUrl' + index + '"]');
    if (thumbnailUrlInput) {
        thumbnailUrlInput.value = item.imageUrl || '';
    }
    
    const thumbnailPreview = document.getElementById('thumbnailPreview' + index);
    if (thumbnailPreview && item.imageUrl) {
        thumbnailPreview.src = item.imageUrl;
        thumbnailPreview.style.display = 'block';
    }
}

function addProduct() {
  if (productCount >= 10) {
    alert("최대 10개의 상품만 추가할 수 있습니다.");
    return;
  }

  const productsArea = document.getElementById("productsArea");

  const productOptions = products.map(p => 
  \`<option value="\${p.productId}" 
           data-name="\${p.productName}"
           data-descr="\${p.description}" 
           data-price="\${p.basePrice}" 
           data-thumbnail="\${p.imageUrl || ''}">
    \${p.productName}
  </option>\`
).join('');

  const entry = \`
    <div class="product-entry border p-3 rounded" id="product-entry-\${productCount}">
      <button type="button" class="btn btn-sm btn-danger delete-btn" onclick="deleteProduct(\${productCount})">X</button>

      <h6>상품 \${productCount + 1}</h6>

      <div class="mb-2">
        <label class="form-label">상품 선택</label>
        <select data-idxnum="\${productCount}" name="productSelect\${productCount}" class="form-select" onchange="toggleProductInput(this, \${productCount})">
          <option value="">[신규 등록]</option>
          \${productOptions}
        </select>
      </div>

      <div id="newProductArea\${productCount}">
        <div class="mb-2">
          <label class="form-label">상품 썸네일</label>
          <input type="file" accept="image/*" class="form-control"  onchange="uploadThumbnail(this, \${productCount})" />
          <input type="hidden" name="thumbnailUrl\${productCount}" />
          <img id="thumbnailPreview\${productCount}" src="" alt="미리보기" class="img-fluid mt-2" style="max-height: 100px; display:none;" />
        </div>

        <div class="mb-2">
          <label class="form-label">상품명</label>
          <input type="text" name="productName\${productCount}" class="form-control" />
        </div>
        
        <div class="mb-2">
          <label class="form-label">상품 상세설명</label>
          <textarea name="description\${productCount}" class="form-control rich-editor" rows="4" style="min-height: 120px;"></textarea>
        </div>

      </div>


      <div class="mb-2">
        <label class="form-label">단가 (₩)</label>
        <input type="number" name="unitPrice\${productCount}" class="form-control" required />
      </div>

      <div class="mb-2">
        <label class="form-label">수량</label>
        <input type="number" name="stock\${productCount}" class="form-control" value="1" min="1" required />
      </div>
    </div>
  \`;
  
  productsArea.insertAdjacentHTML('beforeend', entry);
  
  // 새로 추가된 상품의 리치 에디터 초기화 (신규 추가 시에만)
  if (!isEditMode) {
    setTimeout(() => {
      initializeRichEditor(productCount);
    }, 300);
  }
  
  productCount++;
}

function isDuplicateSelection(selectedValue, currentIdx) {
  const selects = document.querySelectorAll('select[name^="productSelect"]');
  let selectedValues = [];

  selects.forEach((sel, idx) => {
    console.log("check duplication", selectedValue, currentIdx,  sel.value, idx, parseInt(sel.dataset.idxnum));
    if (parseInt(sel.dataset.idxnum) !== currentIdx && sel.value) {
      selectedValues.push(sel.value);
    }
  });

  return selectedValues.includes(selectedValue);
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

    document.querySelector('input[name="thumbnailUrl' + idx + '"]').value = imageUrl;

    const preview = document.getElementById('thumbnailPreview' + idx);
    preview.src = imageUrl;
    preview.style.display = "block";
  } else {
    alert("이미지 업로드에 실패했습니다.");
  }
}

function toggleProductInput(select, idx) {
  const newArea = document.getElementById('newProductArea' + idx);
  const unitPriceInput = document.querySelector('input[name = "unitPrice' + idx + '"]');
  const productNameInput = document.querySelector('input[name = "productName' + idx + '"]');
  const descriptionTextarea = document.querySelector('textarea[name = "description' + idx + '"]');
  const thumbnailInput = document.querySelector('input[name = "thumbnail' + idx + '"]');
  const selectedOption = select.options[select.selectedIndex];
  
  const selectedValue = select.value;
  
      if (selectedValue && isDuplicateSelection(selectedValue, idx)) {
    const modal = new bootstrap.Modal(document.getElementById("duplicateModal"));
    modal.show();

    select.value = "";

    if (newArea) newArea.style.display = "block";
    if (productNameInput) productNameInput.value = "";
    
    // TinyMCE 에디터 내용 초기화
    const descriptionTextarea = document.querySelector('textarea[name="description' + idx + '"]');
    if (descriptionTextarea && tinymce.get(descriptionTextarea.id)) {
        tinymce.get(descriptionTextarea.id).setContent("");
    }
    
    if (unitPriceInput) unitPriceInput.value = "";
    if (thumbnailInput) thumbnailInput.disabled = false;

    return;
  }

  if (select.value) {
    productNameInput.value = selectedOption.dataset.name;
    
    // TinyMCE 에디터에 내용 설정
    const descriptionTextarea = document.querySelector('textarea[name="description' + idx + '"]');
    if (descriptionTextarea && tinymce.get(descriptionTextarea.id)) {
        tinymce.get(descriptionTextarea.id).setContent(selectedOption.dataset.descr || "");
    }
    
    unitPriceInput.value = selectedOption.dataset.price;
    thumbnailInput.disabled = true;
    newArea.style.display = "none";

    const hiddenThumbnailUrlInputName = 'thumbnailUrl' + idx;
    let hiddenInput = document.querySelector('input[name="' + hiddenThumbnailUrlInputName + '"]');
    if (!hiddenInput) {
      hiddenInput = document.createElement('input');
      hiddenInput.type = "hidden";
      hiddenInput.name = hiddenThumbnailUrlInputName;
      document.getElementById('product-entry-' + idx).appendChild(hiddenInput);
    }
    hiddenInput.value = selectedOption.dataset.thumbnail || "";
  } else {
    productNameInput.value = "";
    
    // TinyMCE 에디터 내용 초기화
    const descriptionTextarea = document.querySelector('textarea[name="description' + idx + '"]');
    if (descriptionTextarea && tinymce.get(descriptionTextarea.id)) {
        tinymce.get(descriptionTextarea.id).setContent("");
    }
    
    unitPriceInput.value = "";
    thumbnailInput.disabled = false;
    newArea.style.display = "block";
  }
}

function deleteProduct(idx) {
  const entry = document.getElementById('product-entry-' + idx);
  if (entry) {
    entry.remove();
  }
}

function showConfirmModal() {
  const modal = new bootstrap.Modal(document.getElementById("confirmSubmitModal"));
  modal.show();
}

function submitForm() {
  // 모든 TinyMCE 에디터의 내용을 textarea에 동기화
  tinymce.remove();
  document.getElementById("eventForm").submit();
}

// TinyMCE 초기화 함수
function initializeTinyMCE() {
  console.log('TinyMCE 초기화 시작');
  console.log('찾은 rich-editor 요소들:', document.querySelectorAll('.rich-editor').length);
  
  // 이미 초기화된 에디터가 있으면 제거
  tinymce.remove();
  
  tinymce.init({
    selector: 'textarea.rich-editor',
    height: 200,
    menubar: false,
    plugins: [
      'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
      'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
      'insertdatetime', 'media', 'table', 'code', 'help', 'wordcount'
    ],
    toolbar: 'undo redo | formatselect | ' +
      'bold italic backcolor | alignleft aligncenter ' +
      'alignright alignjustify | bullist numlist outdent indent | ' +
      'removeformat | help',
    content_style: 'body { font-family: "IBM Plex Sans KR", sans-serif; font-size: 14px; }',
    language: 'ko_KR',
    branding: false,
    elementpath: false,
    resize: false,
    setup: function(editor) {
      console.log('TinyMCE 에디터 설정됨:', editor.id);
    },
    init_instance_callback: function(editor) {
      console.log('TinyMCE 에디터 초기화 완료:', editor.id);
    }
  });
}

// 개별 리치 에디터 초기화 함수
function initializeRichEditor(index) {
  const textareaId = 'description' + index;
  const textarea = document.querySelector('textarea[name="description' + index + '"]');
  if (textarea) {
    textarea.id = textareaId;
    console.log('개별 에디터 초기화:', textareaId);
    
    // 이미 해당 에디터가 초기화되어 있으면 제거
    if (tinymce.get(textareaId)) {
      tinymce.remove('#' + textareaId);
    }
    
    tinymce.init({
      selector: '#' + textareaId,
      height: 200,
      menubar: false,
      plugins: [
        'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
        'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
        'insertdatetime', 'media', 'table', 'code', 'help', 'wordcount'
      ],
      toolbar: 'undo redo | formatselect | ' +
        'bold italic backcolor | alignleft aligncenter ' +
        'alignright alignjustify | bullist numlist outdent indent | ' +
        'removeformat | help',
      content_style: 'body { font-family: "IBM Plex Sans KR", sans-serif; font-size: 14px; }',
      language: 'ko_KR',
      branding: false,
      elementpath: false,
      resize: false,
      setup: function(editor) {
        console.log('개별 TinyMCE 에디터 설정됨:', editor.id);
      },
      init_instance_callback: function(editor) {
        console.log('개별 TinyMCE 에디터 초기화 완료:', editor.id);
      }
    });
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
