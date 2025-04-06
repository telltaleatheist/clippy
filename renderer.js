async function download() {
  const url = document.getElementById('url').value;
  const outputEl = document.getElementById('output');

  outputEl.textContent = 'Running yt-dlp...';

  try {
    const result = await window.electronAPI.runYtDlp(url);
    outputEl.textContent = result;
  } catch (err) {
    outputEl.textContent = 'Error:\n' + err;
  }
}
