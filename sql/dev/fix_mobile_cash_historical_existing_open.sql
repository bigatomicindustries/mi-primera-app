-- Corrección exclusiva para Supabase DEV.
-- No ejecutar en producción.
-- Permite reconocer una caja vinculada previamente
-- que fue cerrada offline sin alterar su estado remoto.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_mobile_cash_open_historical(p_device_id uuid, p_local_session_id text, p_opening_amount numeric, p_opened_at timestamp with time zone, p_closed_at timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_device public.pos_devices%ROWTYPE;
  v_session public.cash_sessions%ROWTYPE;
  v_session_id uuid;
BEGIN
  IF p_device_id IS NULL
     OR p_local_session_id IS NULL
     OR length(p_local_session_id) NOT BETWEEN 1 AND 128
     OR p_opening_amount IS NULL
     OR p_opening_amount < 0
     OR p_opened_at IS NULL
     OR p_closed_at IS NULL
     OR p_closed_at < p_opened_at
  THEN
    RAISE EXCEPTION 'Sesión histórica inválida';
  END IF;

  SELECT *
  INTO v_device
  FROM public.pos_devices
  WHERE id = p_device_id
    AND status = 'active'
    AND revoked_at IS NULL
    AND linked_at IS NOT NULL
    AND public_key IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispositivo no autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches
    WHERE id = v_device.branch_id
      AND business_id = v_device.business_id
      AND active = true
  ) THEN
    RAISE EXCEPTION 'Sucursal no disponible';
  END IF;

  -- Serializar importaciones históricas de la sucursal.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'mobile-cash-branch:' || v_device.branch_id::text,
      0
    )
  );

  SELECT cs.*
  INTO v_session
  FROM public.pos_mobile_cash_session_links l
  JOIN public.cash_sessions cs
    ON cs.id = l.cash_session_id
  WHERE l.device_id = p_device_id
    AND l.local_session_id = p_local_session_id
    AND l.business_id = v_device.business_id
    AND l.branch_id = v_device.branch_id
    AND cs.business_id = v_device.business_id
    AND cs.branch_id = v_device.branch_id
  FOR UPDATE OF cs;

  IF FOUND THEN
    -- La apertura y el fondo inicial nunca pueden cambiar
    -- para una sesión que ya está vinculada al dispositivo.
    IF v_session.opening_amount IS DISTINCT FROM p_opening_amount
       OR v_session.opened_at IS DISTINCT FROM p_opened_at
    THEN
      RAISE EXCEPTION
        'La sesión histórica ya existe con datos diferentes';
    END IF;

    -- La caja fue sincronizada abierta y se cerró offline.
    -- Conservarla abierta hasta recibir cash_close.
    IF v_session.status = 'open'
       AND v_session.closed_at IS NULL
    THEN
      RETURN v_session.id;
    END IF;

    -- Una caja ya cerrada debe coincidir exactamente.
    IF v_session.status <> 'closed'
       OR v_session.closed_at IS DISTINCT FROM p_closed_at
    THEN
      RAISE EXCEPTION
        'La sesión histórica ya existe con datos diferentes';
    END IF;

    RETURN v_session.id;
  END IF;

  -- No superponer la sesión con ninguna caja de la
  -- misma sucursal, incluida una caja web abierta.
  IF EXISTS (
    SELECT 1
    FROM public.cash_sessions cs
    WHERE cs.business_id = v_device.business_id
      AND cs.branch_id = v_device.branch_id
      AND cs.opened_at < p_closed_at
      AND (
        cs.closed_at IS NULL
        OR cs.closed_at > p_opened_at
      )
  ) THEN
    RAISE EXCEPTION
      'La sesión histórica se superpone con otra caja';
  END IF;

  -- La sesión nace cerrada para no bloquear una caja
  -- web actualmente abierta. Los importes del corte
  -- se completarán tras importar ventas y movimientos.
  INSERT INTO public.cash_sessions (
    business_id,
    branch_id,
    opened_at,
    closed_at,
    opening_amount,
    status
  )
  VALUES (
    v_device.business_id,
    v_device.branch_id,
    p_opened_at,
    p_closed_at,
    p_opening_amount,
    'closed'
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.pos_mobile_cash_session_links (
    device_id,
    local_session_id,
    business_id,
    branch_id,
    cash_session_id
  )
  VALUES (
    p_device_id,
    p_local_session_id,
    v_device.business_id,
    v_device.branch_id,
    v_session_id
  );

  RETURN v_session_id;
END;
$$;

COMMIT;
