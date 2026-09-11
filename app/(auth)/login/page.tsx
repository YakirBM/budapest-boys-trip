import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-dvh items-center justify-center bg-background" />}>
      <LoginForm />
    </Suspense>
  );
}
