const localtunnel = require('localtunnel');

const TUNNEL_PORT = 5000;

async function createTunnel() {
  console.log('🔗 Создание туннеля...');
  
  try {
    const tunnel = await localtunnel({ 
      port: TUNNEL_PORT,
      subdomain: 'jetube1231'
    });
    
    console.log('✅ Туннель открыт!');
    console.log('🌐 URL: ' + tunnel.url);
    console.log('');
    console.log('📝 Этот URL можно открыть на любом устройстве в интернете');
    console.log('⏹ Нажми Ctrl+C для остановки туннеля');
    
    tunnel.on('close', () => {
      console.log('❌ Туннель закрыт');
    });
    
    tunnel.on('error', (err) => {
      console.error('🚨 Ошибка туннеля:', err.message);
      console.log('🔄 Переподключение через 5 секунд...');
      setTimeout(createTunnel, 5000);
    });
    
  } catch (error) {
    console.error('🚨 Не удалось создать туннель:', error.message);
    console.log('🔄 Повторная попытка через 5 секунд...');
    setTimeout(createTunnel, 5000);
  }
}

createTunnel();
