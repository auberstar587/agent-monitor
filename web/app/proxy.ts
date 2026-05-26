import { NextResponse, type NextRequest } from "next/server";

// Agent Monitor: simplified proxy — no auth, single workspace.
// Routes are flat (no workspace slug prefix).

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Root path: redirect to issues page
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/issues";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
  ],
};
