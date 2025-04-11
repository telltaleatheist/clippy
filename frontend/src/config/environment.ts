// clippy/frontend/src/config/environment.ts
export const environment = {
  production: true,
  apiBaseUrl: window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api',
  socketIoConfig: {
    url: window.location.protocol === 'file:' ? 'http://localhost:3000' : window.location.origin,
    options: {
      path: '/socket.io'
    }
  }
};