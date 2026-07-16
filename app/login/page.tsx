import LoginForm from "./login-form";

// /auth/callback redirects failures here as ?error=… — surface it instead of
// silently showing the send-link form again.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm linkError={error ?? ""} />;
}
