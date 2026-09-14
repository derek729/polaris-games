(function(){
  try {
    var b64 = window.__KNX_B64;
    if (!b64) { window.__KNX_STATUS = 'NO_DATA'; return; }
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var file = new File([bytes], 'knodex-dex-source-v1.zip', { type: 'application/zip' });
    var input = document.querySelector('input[type=file][name="file"]');
    if (!input) { window.__KNX_STATUS = 'NO_INPUT'; return; }
    var dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    window.__KNX_STATUS = 'INJECTED ' + bytes.length;
  } catch (e) {
    window.__KNX_STATUS = 'ERR ' + e.message;
  }
})();