import { AuthShowcase } from "@/components/auth/AuthShowcase";
import { RegisterContainer } from "@/components/auth/RegisterContainer";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen">
      <AuthShowcase />
      <RegisterContainer />
    </div>
  );
}
