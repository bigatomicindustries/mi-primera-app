"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type RolUsuario =
  | "admin"
  | "manager"
  | "cashier";

export type Perfil = {
  id: string;
  full_name: string;
  role: RolUsuario;
  active: boolean;
};

export type Negocio = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
};

type AuthContextType = {
  user: User | null;
  perfil: Perfil | null;
  negocio: Negocio | null;
  cargando: boolean;
  negocioSuspendido: boolean;
  puedeOperar: boolean;

esAdmin: boolean;
esManager: boolean;
esCajero: boolean;
puedeAdministrar: boolean;
esPlatformAdmin: boolean;

  cerrarSesion: () => Promise<void>;
};

const AuthContext =
  createContext<AuthContextType | undefined>(
    undefined
  );

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] =
    useState<User | null>(null);

  const [perfil, setPerfil] =
    useState<Perfil | null>(null);

  const [negocio, setNegocio] =
    useState<Negocio | null>(null);

  const [cargando, setCargando] =
    useState(true);

const [
  negocioSuspendido,
  setNegocioSuspendido,
] = useState(false);

const [
  esPlatformAdmin,
  setEsPlatformAdmin,
] = useState(false);

const [
  puedeOperar,
  setPuedeOperar,
] = useState(false);

function limpiarEstado() {
  setUser(null);
  setPerfil(null);
  setNegocio(null);
  setEsPlatformAdmin(false);
  setPuedeOperar(false);
  setNegocioSuspendido(false);
}

  async function validarUsuario(
    usuario: User
  ): Promise<boolean> {
    // 1. Cargar perfil
    const {
      data: perfilData,
      error: perfilError,
    } = await supabase
      .from("profiles")
      .select(
        "id, full_name, role, active, business_id"
      )
      .eq("id", usuario.id)
      .single();

    if (perfilError || !perfilData) {
      console.log(
        "No se pudo cargar el perfil:",
        perfilError?.message
      );

      limpiarEstado();
      return false;
    }

    if (!perfilData.active) {
      limpiarEstado();
      return false;
    }

    const {
  data: platformAdminData,
  error: platformAdminError,
} = await supabase.rpc(
  "is_platform_admin"
);

if (platformAdminError) {
  console.error(
    "No se pudo verificar platform admin:",
    platformAdminError.message
  );
}

setEsPlatformAdmin(
  platformAdminError
    ? false
    : platformAdminData === true
);

    if (!perfilData.business_id) {
      limpiarEstado();
      return false;
    }

    // 2. Cargar exactamente el negocio
    // perteneciente al usuario.
    const {
      data: negocioData,
      error: negocioError,
    } = await supabase
      .from("businesses")
      .select("id, name, slug, active")
      .eq("id", perfilData.business_id)
      .single();

    if (negocioError || !negocioData) {
      console.log(
        "No se pudo cargar el negocio:",
        negocioError?.message
      );

      limpiarEstado();
      return false;
    }

    // 3. Bloquear negocio suspendido
if (!negocioData.active) {
  setNegocioSuspendido(true);

  // Un Platform Admin conserva su sesión para
  // administrar la plataforma aunque su propio
  // negocio esté suspendido.
  if (platformAdminData === true) {
    setUser(usuario);

    setPerfil({
      id: perfilData.id,
      full_name: perfilData.full_name,
      role: perfilData.role as RolUsuario,
      active: perfilData.active,
    });

    setNegocio(
      negocioData as Negocio
    );

    setPuedeOperar(false);

    return true;
  }

  limpiarEstado();
  return false;
}

setNegocioSuspendido(false);

const {
  data: puedeOperarData,
  error: puedeOperarError,
} = await supabase.rpc(
  "has_operational_subscription"
);

if (puedeOperarError) {
  console.error(
    "No se pudo verificar la suscripción:",
    puedeOperarError.message
  );

  setPuedeOperar(false);
} else {
  setPuedeOperar(
    puedeOperarData === true
  );
}

    // 4. SOLO después de validar todo
    // publicamos la sesión dentro de la app.
    setUser(usuario);

    setPerfil({
      id: perfilData.id,
      full_name: perfilData.full_name,
      role: perfilData.role as RolUsuario,
      active: perfilData.active,
    });

    setNegocio(
      negocioData as Negocio
    );

    return true;
  }

  async function revalidarPuedeOperar() {
  const {
    data: puedeOperarData,
    error: puedeOperarError,
  } = await supabase.rpc(
    "has_operational_subscription"
  );

  if (puedeOperarError) {
    console.error(
      "No se pudo revalidar la suscripción:",
      puedeOperarError.message
    );

    return;
  }

  setPuedeOperar(
    puedeOperarData === true
  );
}

  async function cargarUsuario() {
    try {
      setCargando(true);

      const {
        data: { user: usuarioActual },
        error,
      } = await supabase.auth.getUser();

      if (error || !usuarioActual) {
        limpiarEstado();
        return;
      }

      const permitido =
        await validarUsuario(usuarioActual);

      if (!permitido) {
        await supabase.auth.signOut();
        limpiarEstado();
      }
    } finally {
      setCargando(false);
    }
  }

useEffect(() => {
  // Validación inicial al cargar la aplicación.
  void cargarUsuario();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(
    (event, session) => {
      // Inicio de sesión real.
      if (event === "SIGNED_IN" && session?.user) {
        setCargando(true);

        void validarUsuario(session.user).finally(() => {
          setCargando(false);
        });

        return;
      }

      // Cierre de sesión real.
      if (event === "SIGNED_OUT") {
        limpiarEstado();
        setCargando(false);
        return;
      }

      // No hacemos nada en TOKEN_REFRESHED,
      // INITIAL_SESSION, etc.
      //
      // Así evitamos volver a cargar toda la
      // información del usuario simplemente
      // porque Supabase refrescó el token.
    }
  );

  return () => {
    subscription.unsubscribe();
  };
}, []);

useEffect(() => {
  if (!negocio?.id || !user) {
    return;
  }

  const channel = supabase
    .channel(`subscription-${negocio.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "subscriptions",
        filter: `business_id=eq.${negocio.id}`,
      },
      () => {
        void revalidarPuedeOperar();
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}, [negocio?.id, user?.id]);

  async function cerrarSesion() {
    limpiarEstado();
    await supabase.auth.signOut();
  }

  const esAdmin =
    perfil?.role === "admin";

  const esManager =
    perfil?.role === "manager";

  const esCajero =
    perfil?.role === "cashier";

  const puedeAdministrar =
    esAdmin || esManager;

  return (
    <AuthContext.Provider
      value={{
        user,
        perfil,
        negocio,
        cargando,
        negocioSuspendido,
        puedeOperar,
        esAdmin,
        esManager,
        esCajero,
        puedeAdministrar,
        esPlatformAdmin,
        cerrarSesion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth debe utilizarse dentro de AuthProvider"
    );
  }

  return context;
}