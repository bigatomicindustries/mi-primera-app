export type RolUsuario = "admin" | "manager" | "cashier";

export function nombreRol(role: string | null | undefined) {
  switch (role) {
    case "admin":
      return "Administrador";

    case "manager":
      return "Gerente";

    case "cashier":
      return "Cajero";

    default:
      return role ?? "—";
  }
}