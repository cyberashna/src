(async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    const controlled = Boolean(navigator.serviceWorker.controller);
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      const appCaches = keys.filter(key =>
        /^(workbox-|vite-pwa)/i.test(key) ||
        ['supabase-api-cache', 'supabase-auth-cache', 'images-cache'].includes(key)
      );
      await Promise.all(appCaches.map(key => caches.delete(key)));
    }
    // Unregistering alone leaves this page controlled until it navigates again.
    // Only cached responses are removed; auth, outline drafts and settings stay intact.
    if (controlled) window.location.reload();
  } catch (error) {
    console.error('Could not retire the native web cache', error);
  }
})();
