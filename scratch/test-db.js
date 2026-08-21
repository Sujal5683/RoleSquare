const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.bdbyzcbacdjlpghfftpr:Sujal%40645482@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres'
});

client.connect()
  .then(() => {
    console.log('Connected successfully!');
    return client.end();
  })
  .catch(err => {
    console.error('Connection error:', err);
    process.exit(1);
  });
