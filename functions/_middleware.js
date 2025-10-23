export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // For /join/creator-slug routes, serve /join/index.html
  if (url.pathname.match(/^\/join\/[^\/]+$/)) {
    return context.env.ASSETS.fetch(new URL('/join/index.html', url.origin));
  }
  
  return await context.next();
}