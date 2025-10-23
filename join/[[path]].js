export async function onRequest(context) {
  // This handles all /join/* routes and serves /join/index.html
  return await context.next();
}