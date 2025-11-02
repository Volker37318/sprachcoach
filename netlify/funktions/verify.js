export async function handler(event){
  const token = (event.queryStringParameters||{}).token || "";
  return { statusCode:200, body: JSON.stringify({ valid: !!token }) };
}
