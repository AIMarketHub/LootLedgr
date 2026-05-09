// LootLedger — Supabase auth error → human-readable text.
// Stage 1.B (2026-05-06).
//
// Supabase auth errors surface in the UI with raw cryptic
// strings (e.g. "email rate exceeds limit", "AuthApiError:
// User already registered"). Real dealers don't read those —
// they read short, actionable English.
//
// Pattern: case-insensitive substring match on the lowercased
// raw message. First match wins. Falls back to a length-capped
// version of the original so unknown errors still surface
// something rather than going silent.
//
// Wired into Login / Signup / ForgotPassword. Any future auth
// surface should call translateAuthError(err) before showing
// the message to the user.

export function translateAuthError(rawError){
  if(!rawError)return "An unknown error occurred. Please try again.";
  const raw=String(rawError);
  const msg=raw.toLowerCase();

  // Rate limits — both the email-send rate and the broader
  // Supabase rate limit surface here. The 60-second cooldown is
  // matched FIRST so it doesn't fall into the broader "wait an
  // hour" branch below; the trigger pattern is specific enough
  // ("for security purposes" only ever appears in this Supabase
  // message) that it won't catch unrelated errors.
  if(msg.includes("every 60 seconds")||msg.includes("for security purposes")||msg.includes("once every")){
    return "Wait a minute before requesting another reset link.";
  }
  if(msg.includes("over_email_send_rate_limit")){
    return "Email rate limit reached. Please wait a few minutes before trying again.";
  }
  if(msg.includes("email rate")||msg.includes("rate exceed")||msg.includes("rate limit")){
    return "Too many signup attempts. Please wait an hour and try again, or contact support.";
  }

  // Already registered — common on signup retries.
  if(msg.includes("already registered")||msg.includes("user already exists")||msg.includes("already exists")){
    return "An account with this email or phone already exists. Try signing in instead.";
  }

  // Invalid credentials.
  if(msg.includes("invalid login")||msg.includes("invalid credentials")||msg.includes("invalid password")){
    return "Email/phone or password is incorrect. Try again or use 'Forgot password'.";
  }

  // Email format.
  if(msg.includes("invalid email")||msg.includes("email_address_invalid")){
    return "That doesn't look like a valid email address. Please check and try again.";
  }

  // Phone format.
  if(msg.includes("invalid phone")||msg.includes("phone_number_invalid")){
    return "That doesn't look like a valid phone number. Use the format +614xxxxxxxx.";
  }

  // Password too weak — Supabase's default reads "Password should
  // be at least 6 characters" or similar.
  if(msg.includes("password")&&(msg.includes("weak")||msg.includes("characters"))){
    return "Password is too weak. Use at least 8 characters with a mix of letters and numbers.";
  }

  // Email confirmation gate (when re-enabled in Studio).
  if(msg.includes("email not confirmed")||msg.includes("not_confirmed")){
    return "Please confirm your email first. Check your inbox for the confirmation link.";
  }

  // Network / connectivity.
  if(msg.includes("network")||msg.includes("failed to fetch")||(msg.includes("fetch")&&!msg.includes("not found"))){
    return "Connection problem. Check your internet and try again.";
  }

  // RLS / JWT / permission.
  if(msg.includes("not authenticated")||msg.includes("jwt")||msg.includes("unauthorized")){
    return "Session expired. Please sign in again.";
  }
  if(msg.includes("row-level security")||msg.includes("violates row-level security")){
    return "Permission denied. If this persists, please contact support.";
  }

  // signup_shop RPC's "User already has a shop" guard.
  if(msg.includes("user already has a shop")){
    return "You already have a shop account. Try signing in instead.";
  }

  // Default — strip a leading "Error:" prefix and cap length so
  // we don't blast an unbounded server payload into the inline
  // error banner.
  const cleaned=raw.replace(/^Error:\s*/i,"").trim();
  return cleaned.length>200?cleaned.substring(0,197)+"…":cleaned;
}
