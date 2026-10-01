import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } =
    new URL(request.url);

  const tokenHash =
    searchParams.get("token_hash");

  const type =
    searchParams.get("type") as EmailOtpType | null;

const nextParam =
  searchParams.get("next");

const next =
  nextParam &&
  nextParam.startsWith("/") &&
  !nextParam.startsWith("//")
    ? nextParam
    : "/";

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      `${origin}/login?error=invalid_confirmation`
    );
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(
            ({ name, value, options }) => {
              cookieStore.set(
                name,
                value,
                options
              );
            }
          );
        },
      },
    }
  );

  const { error } =
    await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

  if (error) {
    console.error(
      "Error confirmando correo:",
      error
    );

    return NextResponse.redirect(
      `${origin}/login?error=confirmation_failed`
    );
  }

  return NextResponse.redirect(
    `${origin}${next}`
  );
}