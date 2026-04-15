import { AuthShowcase } from "@/components/auth/AuthShowcase";
import { LoginContainer } from "@/components/auth/LoginContainer";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      <AuthShowcase />
      <LoginContainer />
    </div>
  );
}
