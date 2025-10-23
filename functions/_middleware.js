export async function onRequest(context) {
  const url = new URL(context.request.url);
  const pathname = url.pathname;
  
  console.log('Middleware processing:', pathname);
  
  // Handle /join/creator-name routes
  if (pathname.startsWith('/join/')) {
    const pathSegments = pathname.split('/').filter(segment => segment.length > 0);
    
    // If we have more than just "/join/" (like "/join/mr-crag")
    if (pathSegments.length >= 2) {
      console.log('Rewriting join route for creator:', pathSegments[1]);
      return context.rewrite('/join/index.html');
    }
  }
  
  // For all other routes, continue normally
  return await context.next();
}