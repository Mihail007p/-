import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import AuthForm from "@/components/AuthForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/library");

  return (
    <main className="bg-slate-950">
      <AuthForm mode="login" />
    </main>
  );
}
