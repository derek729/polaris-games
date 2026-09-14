(function(){
  try {
    var el = document.getElementById('wlb64buf');
    if (!el) { window.__WL_STATUS = 'NO_HOLDER'; return; }
    var b64 = el.textContent;
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var file = new File([bytes], 'white-label-wallet-v1.zip', { type: 'application/zip' });
    var input = document.querySelector('input[type=file][name="file"]');
    if (!input) { window.__WL_STATUS = 'NO_INPUT'; return; }
    var dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    window.__WL_STATUS = 'INJECTED ' + bytes.length;
    el.textContent = '';
  } catch (e) {
    window.__WL_STATUS = 'ERR ' + e.message;
  }
})();
