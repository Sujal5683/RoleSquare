require('dotenv').config();
const { getDriveClient } = require('./src/lib/google-client');
async function main() {
  const drive = await getDriveClient('cmt6dgxqm001gjdbsxf02p8vk');
  const q = \
ame contains 'Internship' and name contains 'JNF,INF' and mimeType != 'application/vnd.google-apps.folder'\;
  console.log('Query:', q);
  const resp = await drive.files.list({
    q,
    fields: 'files(id, name)',
    pageSize: 5
  }, { signal: AbortSignal.timeout(10000) });
  console.log(resp.data.files);
}
main().catch(console.error).finally(() => process.exit(0));
