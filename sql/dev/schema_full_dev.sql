--
-- PostgreSQL database dump
--

\restrict VJCLtaSBHbpW7iCCJcBauU5Y5hPinbBQ99WPcorY6Is8kEb8WzfPbH8Ss9OdW9n

-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: add_inventory_stock(uuid, numeric, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_inventory_stock(p_product_id uuid, p_quantity numeric, p_note text DEFAULT NULL::text, p_branch_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_product public.products%rowtype;
  v_business_id uuid;
  v_stock_before numeric;
  v_stock_after numeric;
begin

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.has_role(array['admin', 'manager']) then
    raise exception 'No tienes permisos para agregar existencias';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite realizar operaciones de inventario';
  end if;

  if p_branch_id is null then
    raise exception 'La sucursal es obligatoria';
  end if;

  if not public.has_branch_access(p_branch_id) then
    raise exception 'No tienes acceso a esta sucursal';
  end if;

  if not exists (
    select 1
    from public.branches br
    where br.id = p_branch_id
      and br.business_id = v_business_id
      and br.active = true
  ) then
    raise exception
      'La sucursal no existe, está inactiva o no pertenece a tu negocio';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  -- Validar producto global del negocio
  select *
  into v_product
  from public.products
  where id = p_product_id
    and business_id = v_business_id;

  if not found then
    raise exception
      'Producto no encontrado o no pertenece a tu negocio';
  end if;

  -- Las piezas deben manejar cantidades enteras.
  if v_product.sale_unit = 'piece'
     and p_quantity <> trunc(p_quantity) then
    raise exception
      'Los productos por pieza solo permiten cantidades enteras';
  end if;

  -- Bloquear inventario exclusivamente de esta sucursal
  select bi.stock
  into v_stock_before
  from public.branch_inventory bi
  where bi.business_id = v_business_id
    and bi.branch_id = p_branch_id
    and bi.product_id = p_product_id
  for update;

  if not found then
    raise exception
      'El producto no tiene inventario asignado en esta sucursal';
  end if;

  v_stock_after := v_stock_before + p_quantity;

  update public.branch_inventory
  set
    stock = v_stock_after,
    updated_at = now()
  where business_id = v_business_id
    and branch_id = p_branch_id
    and product_id = p_product_id;

  insert into public.inventory_movements (
    product_id,
    movement_type,
    quantity,
    stock_before,
    stock_after,
    note,
    user_id,
    business_id,
    branch_id
  )
  values (
    p_product_id,
    'stock_in',
    p_quantity,
    v_stock_before,
    v_stock_after,
    p_note,
    auth.uid(),
    v_business_id,
    p_branch_id
  );

  return jsonb_build_object(
    'product_id', p_product_id,
    'product_name', v_product.name,
    'branch_id', p_branch_id,
    'quantity', p_quantity,
    'stock_before', v_stock_before,
    'stock_after', v_stock_after
  );

end;
$$;


--
-- Name: adjust_inventory_stock(uuid, numeric, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.adjust_inventory_stock(p_product_id uuid, p_quantity numeric, p_note text, p_branch_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_product public.products%rowtype;
  v_business_id uuid;
  v_stock_before numeric;
  v_stock_after numeric;
begin

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.has_role(array['admin', 'manager']) then
    raise exception 'No tienes permisos para ajustar inventario';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite realizar operaciones de inventario';
  end if;

  if p_branch_id is null then
    raise exception 'La sucursal es obligatoria';
  end if;

  if not public.has_branch_access(p_branch_id) then
    raise exception 'No tienes acceso a esta sucursal';
  end if;

  if not exists (
    select 1
    from public.branches br
    where br.id = p_branch_id
      and br.business_id = v_business_id
      and br.active = true
  ) then
    raise exception
      'La sucursal no existe, está inactiva o no pertenece a tu negocio';
  end if;

  if p_quantity is null or p_quantity = 0 then
    raise exception 'El ajuste no puede ser 0';
  end if;

  -- Validar producto
  select *
  into v_product
  from public.products
  where id = p_product_id
    and business_id = v_business_id;

  if not found then
    raise exception
      'Producto no encontrado o no pertenece a tu negocio';
  end if;

  -- Las piezas deben manejar cantidades enteras.
  if v_product.sale_unit = 'piece'
     and p_quantity <> trunc(p_quantity) then
    raise exception
      'Los productos por pieza solo permiten cantidades enteras';
  end if;

  -- Bloquear inventario de esta sucursal
  select bi.stock
  into v_stock_before
  from public.branch_inventory bi
  where bi.business_id = v_business_id
    and bi.branch_id = p_branch_id
    and bi.product_id = p_product_id
  for update;

  if not found then
    raise exception
      'El producto no tiene inventario asignado en esta sucursal';
  end if;

  v_stock_after := v_stock_before + p_quantity;

  if v_stock_after < 0 then
    raise exception
      'El ajuste dejaría el inventario en negativo';
  end if;

  update public.branch_inventory
  set
    stock = v_stock_after,
    updated_at = now()
  where business_id = v_business_id
    and branch_id = p_branch_id
    and product_id = p_product_id;

  insert into public.inventory_movements (
    product_id,
    movement_type,
    quantity,
    stock_before,
    stock_after,
    note,
    user_id,
    business_id,
    branch_id
  )
  values (
    p_product_id,
    'adjustment',
    p_quantity,
    v_stock_before,
    v_stock_after,
    p_note,
    auth.uid(),
    v_business_id,
    p_branch_id
  );

  return jsonb_build_object(
    'product_id', p_product_id,
    'product_name', v_product.name,
    'branch_id', p_branch_id,
    'quantity', p_quantity,
    'stock_before', v_stock_before,
    'stock_after', v_stock_after
  );

end;
$$;


--
-- Name: can_manage_inventory_transfers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_inventory_transfers() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.business_id = public.current_business_id()
      and p.active = true
      and p.role = 'admin'
  );
$$;


--
-- Name: cancel_inventory_transfer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_inventory_transfer(p_transfer_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_user_id uuid;
  v_business_id uuid;
  v_transfer public.inventory_transfers%rowtype;
  v_item record;
  v_inventory public.branch_inventory%rowtype;
begin
  v_user_id := auth.uid();
  v_business_id := public.current_business_id();

  if v_user_id is null or v_business_id is null then
    raise exception 'No autenticado';
  end if;

  if not public.can_manage_inventory_transfers() then
    raise exception 'No tienes permiso para gestionar transferencias';
  end if;

  if p_transfer_id is null then
    raise exception 'La transferencia es obligatoria';
  end if;

  -- Bloquear la transferencia evita que pueda recibirse y
  -- cancelarse simultáneamente.
  select *
  into v_transfer
  from public.inventory_transfers
  where id = p_transfer_id
    and business_id = v_business_id
  for update;

  if not found then
    raise exception 'Transferencia no encontrada';
  end if;

  if not public.has_branch_access(v_transfer.source_branch_id) then
    raise exception 'No tienes acceso a la sucursal de origen';
  end if;

  -- Idempotencia: una segunda cancelación no devuelve stock otra vez.
  if v_transfer.status = 'cancelled' then
    return v_transfer.id;
  end if;

  if v_transfer.status = 'received' then
    raise exception 'Una transferencia recibida no puede cancelarse';
  end if;

  if v_transfer.status <> 'in_transit' then
    raise exception 'La transferencia no se puede cancelar en su estado actual';
  end if;

  if not exists (
    select 1
    from public.inventory_transfer_items
    where transfer_id = v_transfer.id
  ) then
    raise exception 'La transferencia no contiene productos';
  end if;

  -- Restaurar el inventario de la sucursal de origen.
  for v_item in
    select
      ti.product_id,
      ti.product_name,
      ti.sale_unit,
      ti.quantity
    from public.inventory_transfer_items ti
    where ti.transfer_id = v_transfer.id
    order by ti.product_id
  loop

    insert into public.branch_inventory (
      business_id,
      branch_id,
      product_id,
      stock,
      minimum_stock
    )
    values (
      v_business_id,
      v_transfer.source_branch_id,
      v_item.product_id,
      0,
      0
    )
    on conflict (branch_id, product_id) do nothing;

    select *
    into v_inventory
    from public.branch_inventory
    where branch_id = v_transfer.source_branch_id
      and product_id = v_item.product_id
    for update;

    if not found then
      raise exception 'No se pudo obtener el inventario del producto %',
        v_item.product_name;
    end if;

    if v_inventory.business_id <> v_business_id then
      raise exception 'Inventario inválido para el producto %',
        v_item.product_name;
    end if;

    update public.branch_inventory
    set
      stock = v_inventory.stock + v_item.quantity,
      updated_at = now()
    where id = v_inventory.id;

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reference_id,
      note,
      user_id,
      business_id,
      branch_id
    )
    values (
      v_item.product_id,
      'transfer_cancel',
      v_item.quantity,
      v_inventory.stock,
      v_inventory.stock + v_item.quantity,
      v_transfer.id,
      'Cancelación de transferencia entre sucursales',
      v_user_id,
      v_business_id,
      v_transfer.source_branch_id
    );
  end loop;

  update public.inventory_transfers
  set status = 'cancelled'
  where id = v_transfer.id;

  return v_transfer.id;
end;
$$;


--
-- Name: cancel_purchase(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_purchase(p_purchase_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
  v_branch_id uuid;

  v_purchase_number text;
  v_purchase_status text;

  v_item record;
  v_stock_before integer;
  v_stock_after integer;

  v_cash_movement record;
  v_cash_status text;
  v_cash_branch_id uuid;

begin

  -- ==========================================
  -- SEGURIDAD
  -- ==========================================

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.has_role(array['admin', 'manager']) then
    raise exception
      'No tienes permisos para cancelar compras';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception
      'No se pudo determinar el negocio del usuario';
  end if;

  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite realizar operaciones de compras';
  end if;


  -- ==========================================
  -- 1. BLOQUEAR Y OBTENER COMPRA
  -- ==========================================

  select
    number,
    status,
    branch_id
  into
    v_purchase_number,
    v_purchase_status,
    v_branch_id
  from public.purchases
  where id = p_purchase_id
    and business_id = v_business_id
  for update;

  if not found then
    raise exception
      'La compra no existe o no pertenece a tu negocio';
  end if;

  if v_purchase_status = 'cancelled' then
    raise exception
      'La compra ya está cancelada';
  end if;

  if v_branch_id is null then
    raise exception
      'La compra no tiene una sucursal asociada';
  end if;

  if not public.has_branch_access(v_branch_id) then
    raise exception
      'No tienes acceso a la sucursal de esta compra';
  end if;

  if not exists (
    select 1
    from public.branches br
    where br.id = v_branch_id
      and br.business_id = v_business_id
      and br.active = true
  ) then
    raise exception
      'La sucursal de esta compra no existe o está inactiva';
  end if;


  -- ==========================================
  -- 2. BLOQUEAR SI YA TIENE DEVOLUCIONES
  -- ==========================================

  if exists (
    select 1
    from public.purchase_returns pr
    where pr.purchase_id = p_purchase_id
      and pr.business_id = v_business_id
  ) then
    raise exception
      'No puedes cancelar una compra que ya tiene devoluciones registradas';
  end if;


  -- ==========================================
  -- 3. VALIDAR TODO EL INVENTARIO PRIMERO
  -- ==========================================

  for v_item in
    select
      product_id,
      name,
      quantity
    from public.purchase_items
    where purchase_id = p_purchase_id
      and business_id = v_business_id
  loop

    if v_item.product_id is null then
      raise exception
        'No se puede cancelar porque el producto "%" ya no existe',
        v_item.name;
    end if;

    select bi.stock
    into v_stock_before
    from public.branch_inventory bi
    where bi.business_id = v_business_id
      and bi.branch_id = v_branch_id
      and bi.product_id = v_item.product_id
    for update;

    if not found then
      raise exception
        'No existe inventario de "%" en la sucursal de esta compra',
        v_item.name;
    end if;

    if v_stock_before < v_item.quantity then
      raise exception
        'No hay stock suficiente de "%" en esta sucursal. Stock actual: %, se necesitan: %',
        v_item.name,
        v_stock_before,
        v_item.quantity;
    end if;

  end loop;


  -- ==========================================
  -- 4. REVERTIR INVENTARIO DE ESTA SUCURSAL
  -- ==========================================

  for v_item in
    select
      product_id,
      name,
      quantity
    from public.purchase_items
    where purchase_id = p_purchase_id
      and business_id = v_business_id
  loop

    select bi.stock
    into v_stock_before
    from public.branch_inventory bi
    where bi.business_id = v_business_id
      and bi.branch_id = v_branch_id
      and bi.product_id = v_item.product_id
    for update;

    v_stock_after :=
      v_stock_before - v_item.quantity;

    update public.branch_inventory
    set
      stock = v_stock_after,
      updated_at = now()
    where business_id = v_business_id
      and branch_id = v_branch_id
      and product_id = v_item.product_id;


    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reference_id,
      note,
      user_id,
      business_id,
      branch_id
    )
    values (
      v_item.product_id,
      'purchase_cancel',
      -v_item.quantity,
      v_stock_before,
      v_stock_after,
      p_purchase_id,
      'Cancelación de compra ' || v_purchase_number,
      auth.uid(),
      v_business_id,
      v_branch_id
    );

  end loop;


  -- ==========================================
  -- 5. BUSCAR SALIDA DE CAJA DE ESTA COMPRA
  -- ==========================================

  select
    cm.id,
    cm.cash_session_id,
    cm.amount,
    cm.branch_id
  into v_cash_movement
  from public.cash_movements cm
  where cm.reference_id = p_purchase_id
    and cm.movement_type = 'expense'
    and cm.business_id = v_business_id
    and cm.branch_id = v_branch_id
  order by cm.created_at desc
  limit 1;


  -- ==========================================
  -- 6. DEVOLVER DINERO A CAJA
  -- ==========================================

  if found then

    select
      status,
      branch_id
    into
      v_cash_status,
      v_cash_branch_id
    from public.cash_sessions
    where id = v_cash_movement.cash_session_id
      and business_id = v_business_id;

    if found
       and v_cash_status = 'open'
       and v_cash_branch_id = v_branch_id then

      perform public.register_cash_movement(
        v_cash_movement.cash_session_id,
        'income',
        v_cash_movement.amount,
        'Cancelación de compra ' || v_purchase_number,
        p_purchase_id
      );

    end if;

  end if;


  -- ==========================================
  -- 7. MARCAR COMPRA COMO CANCELADA
  -- ==========================================

  update public.purchases
  set
    status = 'cancelled',
    cancelled_by = auth.uid(),
    cancelled_at = now(),
    updated_at = now()
  where id = p_purchase_id
    and business_id = v_business_id
    and branch_id = v_branch_id;

end;
$$;


--
-- Name: check_pos_pairing_attempt(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_pos_pairing_attempt(p_token_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
    v_attempts integer;
BEGIN
    IF p_token_hash IS NULL
       OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN false;
    END IF;

    -- Serializar intentos del mismo código.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            p_token_hash,
            0
        )
    );

    SELECT COUNT(*)
    INTO v_attempts
    FROM public.pos_device_pairing_attempts
    WHERE pairing_token_hash = p_token_hash
      AND attempted_at > clock_timestamp() - INTERVAL '10 minutes';

    IF v_attempts >= 5 THEN
        RETURN false;
    END IF;

    INSERT INTO public.pos_device_pairing_attempts (
        pairing_token_hash,
        successful
    )
    VALUES (
        p_token_hash,
        false
    );

    RETURN true;
END;
$_$;


--
-- Name: cleanup_pos_pairing_attempts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_pos_pairing_attempts() RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
    v_deleted integer;
BEGIN
    DELETE FROM public.pos_device_pairing_attempts
    WHERE attempted_at < clock_timestamp() - INTERVAL '24 hours';

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN v_deleted;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cash_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    opening_amount numeric DEFAULT 0 NOT NULL,
    closing_amount numeric,
    expected_amount numeric,
    difference numeric,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    opened_by uuid,
    closed_by uuid,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    CONSTRAINT cash_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: close_cash_session(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_cash_session(p_cash_session_id uuid, p_closing_amount numeric) RETURNS public.cash_sessions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_session public.cash_sessions%rowtype;
  v_business_id uuid;
  v_branch_id uuid;

  v_cash_sales numeric := 0;
  v_income numeric := 0;
  v_expense numeric := 0;

  v_expected numeric := 0;
  v_difference numeric := 0;
begin

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_active_user() then
    raise exception 'Usuario inactivo';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite realizar operaciones de caja';
  end if;

  if p_closing_amount is null or p_closing_amount < 0 then
    raise exception 'El efectivo contado no puede ser negativo';
  end if;

  -- Obtener y bloquear la sesión.
  select *
  into v_session
  from public.cash_sessions
  where id = p_cash_session_id
    and business_id = v_business_id
  for update;

  if not found then
    raise exception
      'La sesión de caja no existe o no pertenece a tu negocio';
  end if;

  if v_session.status <> 'open' then
    raise exception 'La caja ya está cerrada';
  end if;

  v_branch_id := v_session.branch_id;

  if v_branch_id is null then
    raise exception
      'La sesión de caja no tiene una sucursal asignada';
  end if;

  -- El usuario debe tener acceso a la sucursal de esta caja.
  if not public.has_branch_access(v_branch_id) then
    raise exception
      'No tienes acceso a la sucursal de esta caja';
  end if;

  -- Ventas en efectivo de esta caja y sucursal.
  select coalesce(
    sum(
      coalesce(paid_amount, 0)
      - coalesce(change_due, 0)
    ),
    0
  )
  into v_cash_sales
  from public.sales
  where cash_session_id = p_cash_session_id
    and business_id = v_business_id
    and branch_id = v_branch_id
    and payment_method = 'cash';

  -- Entradas de esta caja y sucursal.
  select coalesce(sum(amount), 0)
  into v_income
  from public.cash_movements
  where cash_session_id = p_cash_session_id
    and business_id = v_business_id
    and branch_id = v_branch_id
    and movement_type = 'income';

  -- Salidas de esta caja y sucursal.
  select coalesce(sum(amount), 0)
  into v_expense
  from public.cash_movements
  where cash_session_id = p_cash_session_id
    and business_id = v_business_id
    and branch_id = v_branch_id
    and movement_type = 'expense';

  v_expected :=
    coalesce(v_session.opening_amount, 0)
    + v_cash_sales
    + v_income
    - v_expense;

  v_difference :=
    p_closing_amount - v_expected;

  update public.cash_sessions
  set
    closed_at = now(),
    closing_amount = p_closing_amount,
    expected_amount = v_expected,
    difference = v_difference,
    status = 'closed',
    closed_by = auth.uid()
  where id = p_cash_session_id
    and business_id = v_business_id
    and branch_id = v_branch_id
  returning *
  into v_session;

  return v_session;

end;
$$;


--
-- Name: confirm_pos_device_pairing(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_pos_device_pairing(p_challenge_id uuid, p_challenge_hash text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
    v_device_id uuid;
    v_challenge public.pos_device_pairing_challenges%ROWTYPE;
    v_token public.pos_device_pairing_tokens%ROWTYPE;
    v_device public.pos_devices%ROWTYPE;
    v_now timestamptz;
BEGIN
    IF p_challenge_id IS NULL
       OR p_challenge_hash IS NULL
       OR p_challenge_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN NULL;
    END IF;

    -- Identificar el dispositivo sin bloquear registros.
    SELECT t.device_id
    INTO v_device_id
    FROM public.pos_device_pairing_challenges c
    JOIN public.pos_device_pairing_tokens t
      ON t.id = c.pairing_token_id
    WHERE c.id = p_challenge_id;

    IF v_device_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Mantener el orden de coordinación por dispositivo.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'pos-device-pairing:' || v_device_id::text,
            0
        )
    );

    -- Bloquear primero el código temporal.
    SELECT t.*
    INTO v_token
    FROM public.pos_device_pairing_tokens t
    JOIN public.pos_device_pairing_challenges c
      ON c.pairing_token_id = t.id
    WHERE c.id = p_challenge_id
    FOR UPDATE OF t;

    IF NOT FOUND
       OR v_token.device_id IS DISTINCT FROM v_device_id THEN
        RETURN NULL;
    END IF;

    -- Bloquear el dispositivo.
    SELECT *
    INTO v_device
    FROM public.pos_devices
    WHERE id = v_token.device_id
      AND business_id = v_token.business_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Bloquear el desafío.
    SELECT *
    INTO v_challenge
    FROM public.pos_device_pairing_challenges
    WHERE id = p_challenge_id
      AND pairing_token_id = v_token.id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_now := clock_timestamp();

    IF v_token.used_at IS NOT NULL
       OR v_token.expires_at <= v_now
       OR v_challenge.used_at IS NOT NULL
       OR v_challenge.expires_at <= v_now
       OR v_challenge.challenge_hash <> p_challenge_hash
       OR v_device.status <> 'active'
       OR v_device.linked_at IS NOT NULL
       OR v_device.public_key IS NOT NULL THEN
        RETURN NULL;
    END IF;

    -- Vincular dispositivo.
    UPDATE public.pos_devices
    SET
        public_key = v_challenge.public_key,
        linked_at = v_now
    WHERE id = v_device.id;

    -- Consumir el desafío.
    UPDATE public.pos_device_pairing_challenges
    SET used_at = v_now
    WHERE id = v_challenge.id;

    -- Consumir el código.
    UPDATE public.pos_device_pairing_tokens
    SET used_at = v_now
    WHERE id = v_token.id;

    RETURN v_device.id;
END;
$_$;


--
-- Name: consume_pos_device_auth_challenge(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_pos_device_auth_challenge(p_challenge_id uuid, p_challenge_hash text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_device_id uuid;
  v_device public.pos_devices%ROWTYPE;
  v_challenge public.pos_device_auth_challenges%ROWTYPE;
  v_business_active boolean;
  v_branch_active boolean;
  v_now timestamptz;
BEGIN
  IF p_challenge_id IS NULL
     OR p_challenge_hash IS NULL
     OR p_challenge_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN NULL;
  END IF;

  SELECT device_id
  INTO v_device_id
  FROM public.pos_device_auth_challenges
  WHERE id = p_challenge_id;

  IF v_device_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Serializar la generación y el consumo por dispositivo.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pos_device_auth:' || v_device_id::text,
      0
    )
  );

  -- Bloquear el dispositivo.
  SELECT *
  INTO v_device
  FROM public.pos_devices
  WHERE id = v_device_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Bloquear el desafío.
  SELECT *
  INTO v_challenge
  FROM public.pos_device_auth_challenges
  WHERE id = p_challenge_id
    AND device_id = v_device.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Comprobar que la empresa sigue activa.
  SELECT b.active
  INTO v_business_active
  FROM public.businesses AS b
  WHERE b.id = v_device.business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Comprobar que la sucursal sigue activa
  -- y pertenece a la empresa del dispositivo.
  SELECT br.active
  INTO v_branch_active
  FROM public.branches AS br
  WHERE br.id = v_device.branch_id
    AND br.business_id = v_device.business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_now := pg_catalog.clock_timestamp();

  IF v_device.status <> 'active'
     OR v_device.revoked_at IS NOT NULL
     OR v_device.public_key IS NULL
     OR v_device.linked_at IS NULL
     OR v_business_active IS NOT TRUE
     OR v_branch_active IS NOT TRUE
     OR v_challenge.used_at IS NOT NULL
     OR v_challenge.expires_at <= v_now
     OR v_challenge.challenge_hash <> p_challenge_hash
  THEN
    RETURN NULL;
  END IF;

  -- Consumir el desafío una sola vez.
  UPDATE public.pos_device_auth_challenges
  SET used_at = v_now
  WHERE id = v_challenge.id;

  -- Registrar la verificación.
  UPDATE public.pos_devices
  SET last_verified_at = v_now
  WHERE id = v_device.id;

  RETURN v_device.id;
END;
$_$;


--
-- Name: create_branch(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_branch(p_name text, p_code text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_business_id uuid;
  v_branch_id uuid;

  v_name text;
  v_code text;

  v_max_branches integer;
  v_current_branches bigint;
begin
  -- Usuario autenticado
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  -- Solo administradores pueden crear sucursales
  if not public.has_role(array['admin']) then
    raise exception 'No tienes permisos para crear sucursales';
  end if;

  -- La suscripción debe permitir operar
  if not public.has_operational_subscription() then
    raise exception 'La suscripción no permite realizar esta operación';
  end if;

  -- Obtener negocio actual
  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No hay un negocio activo disponible';
  end if;

  -- Limpiar datos recibidos
  v_name := nullif(trim(p_name), '');
  v_code := nullif(upper(trim(p_code)), '');

  if v_name is null then
    raise exception 'El nombre de la sucursal es obligatorio';
  end if;

  -- Obtener límite de sucursales del plan
  select p.max_branches
  into v_max_branches
  from public.subscriptions s
  join public.plans p
    on p.id = s.plan_id
  where s.business_id = v_business_id
    and p.active = true
    and s.status in ('trialing', 'active', 'past_due');

  if v_max_branches is null then
    raise exception 'No se pudo determinar el límite de sucursales del plan';
  end if;

  -- Contamos únicamente sucursales activas para el límite
  select count(*)
  into v_current_branches
  from public.branches b
  where b.business_id = v_business_id
    and b.active = true;

  if v_current_branches >= v_max_branches then
    raise exception
      'Has alcanzado el límite de % sucursal(es) de tu plan',
      v_max_branches;
  end if;

  -- Evitar código duplicado dentro del negocio
  if v_code is not null and exists (
    select 1
    from public.branches b
    where b.business_id = v_business_id
      and b.code = v_code
  ) then
    raise exception 'Ya existe una sucursal con el código %', v_code;
  end if;

  -- Crear sucursal.
  -- Nunca puede convertirse en principal desde este RPC.
  insert into public.branches (
    business_id,
    name,
    code,
    active,
    is_main
  )
  values (
    v_business_id,
    v_name,
    v_code,
    true,
    false
  )
  returning id into v_branch_id;

  -- Crear inventario para todo el catálogo existente.
  -- Una sucursal nueva comienza con stock y mínimo propios en 0.
  insert into public.branch_inventory (
    business_id,
    branch_id,
    product_id,
    stock,
    minimum_stock
  )
  select
    v_business_id,
    v_branch_id,
    p.id,
    0,
    0
  from public.products p
  where p.business_id = v_business_id
  on conflict (branch_id, product_id) do nothing;

  -- El administrador que la creó obtiene acceso.
  insert into public.profile_branches (
    profile_id,
    branch_id,
    business_id
  )
  values (
    v_user_id,
    v_branch_id,
    v_business_id
  )
  on conflict (profile_id, branch_id) do nothing;

  return v_branch_id;
end;
$$;


--
-- Name: create_pos_device_auth_challenge(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_pos_device_auth_challenge(p_device_id uuid, p_challenge_hash text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_device_id uuid;
  v_challenge_id uuid;
BEGIN
  IF p_device_id IS NULL
     OR p_challenge_hash IS NULL
     OR p_challenge_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid authentication challenge';
  END IF;

  -- Serializar solicitudes para el mismo dispositivo.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pos_device_auth:' || p_device_id::text,
      0
    )
  );

  -- Verificar dispositivo, empresa y sucursal.
  SELECT d.id
  INTO v_device_id
  FROM public.pos_devices AS d
  INNER JOIN public.businesses AS b
    ON b.id = d.business_id
  INNER JOIN public.branches AS br
    ON br.id = d.branch_id
    AND br.business_id = d.business_id
  WHERE d.id = p_device_id
    AND d.status = 'active'
    AND d.revoked_at IS NULL
    AND d.public_key IS NOT NULL
    AND d.linked_at IS NOT NULL
    AND b.active IS TRUE
    AND br.active IS TRUE
  FOR UPDATE OF d, b, br;

  IF v_device_id IS NULL THEN
    RAISE EXCEPTION 'Device unavailable';
  END IF;

  -- Invalidar desafíos anteriores pendientes.
  UPDATE public.pos_device_auth_challenges
  SET used_at = pg_catalog.now()
  WHERE device_id = p_device_id
    AND used_at IS NULL;

  -- Registrar únicamente el hash del desafío.
  INSERT INTO public.pos_device_auth_challenges (
    device_id,
    challenge_hash,
    expires_at
  )
  VALUES (
    p_device_id,
    p_challenge_hash,
    pg_catalog.now() + interval '2 minutes'
  )
  RETURNING id INTO v_challenge_id;

  RETURN v_challenge_id;
END;
$_$;


--
-- Name: create_pos_device_pairing_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_pos_device_pairing_token(p_device_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
    v_business_id uuid;
    v_device public.pos_devices%ROWTYPE;
    v_token text;
    v_token_hash text;
BEGIN
    IF auth.uid() IS NULL
       OR NOT public.is_active_user()
       OR NOT public.has_role(ARRAY['admin']) THEN
        RAISE EXCEPTION 'Usuario no autorizado';
    END IF;

    IF NOT public.has_operational_subscription() THEN
        RAISE EXCEPTION 'Suscripción no habilitada';
    END IF;

    v_business_id := public.current_business_id();

    -- Coordinar operaciones sobre este dispositivo.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'pos-device-pairing:' || p_device_id::text,
            0
        )
    );

    SELECT *
    INTO v_device
    FROM public.pos_devices
    WHERE id = p_device_id
      AND business_id = v_business_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dispositivo no encontrado';
    END IF;

    IF v_device.status <> 'active' THEN
        RAISE EXCEPTION 'Dispositivo revocado';
    END IF;

    IF v_device.linked_at IS NOT NULL THEN
        RAISE EXCEPTION 'El dispositivo ya está vinculado';
    END IF;

    IF NOT public.has_branch_access(v_device.branch_id) THEN
        RAISE EXCEPTION 'Sin acceso a la sucursal';
    END IF;

    UPDATE public.pos_device_pairing_tokens
    SET used_at = clock_timestamp()
    WHERE device_id = p_device_id
      AND used_at IS NULL;

    v_token := pg_catalog.encode(
        extensions.gen_random_bytes(32),
        'hex'
    );

    v_token_hash := pg_catalog.encode(
        extensions.digest(v_token, 'sha256'),
        'hex'
    );

    INSERT INTO public.pos_device_pairing_tokens (
        device_id,
        business_id,
        created_by,
        token_hash,
        expires_at
    )
    VALUES (
        p_device_id,
        v_business_id,
        auth.uid(),
        v_token_hash,
        clock_timestamp() + INTERVAL '10 minutes'
    );

    RETURN v_token;
END;
$$;


--
-- Name: create_pos_pairing_challenge(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_pos_pairing_challenge(p_token_hash text, p_challenge_hash text, p_public_key text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
    v_token public.pos_device_pairing_tokens%ROWTYPE;
    v_device public.pos_devices%ROWTYPE;
    v_challenge_id uuid;
    v_now timestamptz;
BEGIN
    IF p_token_hash IS NULL
       OR p_token_hash !~ '^[0-9a-f]{64}$'
       OR p_challenge_hash IS NULL
       OR p_challenge_hash !~ '^[0-9a-f]{64}$'
       OR p_public_key IS NULL
       OR length(p_public_key) > 2048
       OR length(btrim(p_public_key)) = 0 THEN
        RAISE EXCEPTION 'Datos de vinculación inválidos';
    END IF;

    -- Bloquear el código durante la operación.
    SELECT *
    INTO v_token
    FROM public.pos_device_pairing_tokens
    WHERE token_hash = p_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Código inválido';
    END IF;

    v_now := clock_timestamp();

    IF v_token.used_at IS NOT NULL
       OR v_token.expires_at <= v_now THEN
        RAISE EXCEPTION 'Código vencido o utilizado';
    END IF;

    SELECT *
    INTO v_device
    FROM public.pos_devices
    WHERE id = v_token.device_id
      AND business_id = v_token.business_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_device.status <> 'active'
       OR v_device.linked_at IS NOT NULL THEN
        RAISE EXCEPTION 'Dispositivo no disponible';
    END IF;

    -- Invalidar desafíos anteriores.
    UPDATE public.pos_device_pairing_challenges
    SET used_at = v_now
    WHERE pairing_token_id = v_token.id
      AND used_at IS NULL;

    INSERT INTO public.pos_device_pairing_challenges (
        pairing_token_id,
        challenge_hash,
        public_key,
        expires_at
    )
    VALUES (
        v_token.id,
        p_challenge_hash,
        p_public_key,
        LEAST(
            v_now + INTERVAL '2 minutes',
            v_token.expires_at
        )
    )
    RETURNING id INTO v_challenge_id;

    RETURN v_challenge_id;
END;
$_$;


--
-- Name: create_product(text, text, numeric, numeric, numeric, numeric, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_product(p_name text, p_barcode text DEFAULT NULL::text, p_cost_price numeric DEFAULT 0, p_sale_price numeric DEFAULT 0, p_initial_stock numeric DEFAULT 0, p_minimum_stock numeric DEFAULT 0, p_branch_id uuid DEFAULT NULL::uuid, p_sale_unit text DEFAULT 'piece'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
  v_product_id uuid;
  v_branch record;
begin

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.has_role(array['admin', 'manager']) then
    raise exception 'No tienes permisos para crear productos';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite crear productos';
  end if;

  if p_branch_id is null then
    raise exception 'La sucursal es obligatoria';
  end if;

  if not public.has_branch_access(p_branch_id) then
    raise exception 'No tienes acceso a esta sucursal';
  end if;

  if not exists (
    select 1
    from public.branches br
    where br.id = p_branch_id
      and br.business_id = v_business_id
      and br.active = true
  ) then
    raise exception
      'La sucursal no existe, está inactiva o no pertenece a tu negocio';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'El nombre del producto es obligatorio';
  end if;

  if p_cost_price is null or p_cost_price < 0 then
    raise exception 'El costo no puede ser negativo';
  end if;

  if p_sale_price is null or p_sale_price < 0 then
    raise exception 'El precio de venta no puede ser negativo';
  end if;

  if p_initial_stock is null or p_initial_stock < 0 then
    raise exception 'El stock inicial no puede ser negativo';
  end if;

  if p_minimum_stock is null or p_minimum_stock < 0 then
    raise exception 'El stock mínimo no puede ser negativo';
  end if;

  if p_sale_unit is null
     or p_sale_unit not in ('piece', 'kg') then
    raise exception 'Unidad de venta no válida';
  end if;

  insert into public.products (
    name,
    barcode,
    cost_price,
    sale_price,
    sale_unit,
    business_id
  )
  values (
    trim(p_name),
    nullif(trim(p_barcode), ''),
    p_cost_price,
    p_sale_price,
    p_sale_unit,
    v_business_id
  )
  returning id into v_product_id;

  -- Crear inventario para todas las sucursales activas.
  for v_branch in
    select br.id
    from public.branches br
    where br.business_id = v_business_id
      and br.active = true
  loop

    insert into public.branch_inventory (
      business_id,
      branch_id,
      product_id,
      stock,
      minimum_stock
    )
    values (
      v_business_id,
      v_branch.id,
      v_product_id,
      case
        when v_branch.id = p_branch_id
          then p_initial_stock
        else 0
      end,
      case
        when v_branch.id = p_branch_id
          then p_minimum_stock
        else 0
      end
    );

  end loop;

  if p_initial_stock > 0 then

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      note,
      user_id,
      business_id,
      branch_id
    )
    values (
      v_product_id,
      'stock_in',
      p_initial_stock,
      0,
      p_initial_stock,
      'Stock inicial del producto',
      auth.uid(),
      v_business_id,
      p_branch_id
    );

  end if;

  return jsonb_build_object(
    'product_id', v_product_id,
    'branch_id', p_branch_id,
    'name', trim(p_name),
    'barcode', nullif(trim(p_barcode), ''),
    'cost_price', p_cost_price,
    'sale_price', p_sale_price,
    'sale_unit', p_sale_unit,
    'stock', p_initial_stock,
    'minimum_stock', p_minimum_stock
  );

end;
$$;


--
-- Name: create_sale(jsonb, numeric, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_sale(p_items jsonb, p_paid_amount numeric, p_payment_method text DEFAULT 'cash'::text, p_branch_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$

declare
  v_sale_id uuid;
  v_cash_session_id uuid;
  v_business_id uuid;

  v_item jsonb;
  v_product products%rowtype;

  v_quantity numeric;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_change_due numeric := 0;
  v_paid_amount numeric := 0;
  v_number text;

  v_stock_before numeric;
  v_stock_after numeric;

begin

  -- =========================
  -- SEGURIDAD
  -- =========================

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_active_user() then
    raise exception 'Usuario inactivo o sin autorización';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception
      'No se pudo determinar el negocio del usuario';
  end if;


  -- =========================
  -- SUSCRIPCIÓN
  -- =========================

  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite realizar ventas';
  end if;


  -- =========================
  -- VALIDAR SUCURSAL
  -- =========================

  if p_branch_id is null then
    raise exception 'La sucursal es obligatoria';
  end if;

  if not public.has_branch_access(p_branch_id) then
    raise exception
      'No tienes acceso a esta sucursal';
  end if;

  if not exists (
    select 1
    from public.branches br
    where br.id = p_branch_id
      and br.business_id = v_business_id
      and br.active = true
  ) then
    raise exception
      'La sucursal no existe, está inactiva o no pertenece a tu negocio';
  end if;


  -- =========================
  -- VALIDAR CARRITO
  -- =========================

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;


  -- =========================
  -- VALIDAR MÉTODO DE PAGO
  -- =========================

  if p_payment_method not in ('cash', 'card', 'transfer') then
    raise exception 'Método de pago no válido';
  end if;


  -- =========================
  -- BUSCAR CAJA DE SUCURSAL
  -- =========================

  select cs.id
  into v_cash_session_id
  from public.cash_sessions cs
  where cs.status = 'open'
    and cs.business_id = v_business_id
    and cs.branch_id = p_branch_id
  order by cs.opened_at desc
  limit 1;

  if v_cash_session_id is null then
    raise exception
      'No hay una caja abierta para esta sucursal. Abre caja antes de registrar una venta.';
  end if;


  -- =========================
  -- GENERAR NÚMERO DE VENTA
  -- =========================

  v_number :=
    'V-' ||
    to_char(now(), 'YYYYMMDD-HH24MISS') ||
    '-' ||
    lpad(floor(random() * 1000)::text, 3, '0');


  -- =========================
  -- CREAR VENTA
  -- =========================

  insert into public.sales (
    number,
    subtotal,
    discount,
    total,
    paid_amount,
    change_due,
    cash_session_id,
    payment_method,
    user_id,
    business_id,
    branch_id
  )
  values (
    v_number,
    0,
    0,
    0,
    0,
    0,
    v_cash_session_id,
    p_payment_method,
    auth.uid(),
    v_business_id,
    p_branch_id
  )
  returning id into v_sale_id;


  -- =========================
  -- PROCESAR PRODUCTOS
  -- =========================

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop

    -- Ahora aceptamos cantidades decimales
    v_quantity := (v_item->>'quantity')::numeric;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Cantidad inválida';
    end if;

    -- Máximo 3 decimales
    if v_quantity <> round(v_quantity, 3) then
      raise exception
        'La cantidad no puede tener más de 3 decimales';
    end if;


    -- =========================
    -- BUSCAR PRODUCTO
    -- =========================

    select *
    into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
      and business_id = v_business_id;

    if not found then
      raise exception
        'Producto no encontrado o no pertenece a tu negocio';
    end if;


    -- =========================
    -- VALIDAR UNIDAD DE VENTA
    -- =========================

    if v_product.sale_unit = 'piece'
       and v_quantity <> trunc(v_quantity) then
      raise exception
        'El producto "%" se vende por pieza y requiere una cantidad entera',
        v_product.name;
    end if;


    -- =========================
    -- BLOQUEAR INVENTARIO
    -- =========================

    select bi.stock
    into v_stock_before
    from public.branch_inventory bi
    where bi.business_id = v_business_id
      and bi.branch_id = p_branch_id
      and bi.product_id = v_product.id
    for update;

    if not found then
      raise exception
        'El producto % no tiene inventario asignado en esta sucursal',
        v_product.name;
    end if;


    -- =========================
    -- VALIDAR STOCK
    -- =========================

    if v_stock_before < v_quantity then
      raise exception
        'Stock insuficiente para % en esta sucursal. Disponible: %, solicitado: %',
        v_product.name,
        v_stock_before,
        v_quantity;
    end if;


    -- =========================
    -- CALCULAR NUEVO STOCK
    -- =========================

    v_stock_after :=
      v_stock_before - v_quantity;


    -- =========================
    -- CALCULAR SUBTOTAL
    -- =========================

    v_subtotal :=
      v_subtotal +
      (v_product.sale_price * v_quantity);


    -- =========================
    -- DETALLE DE VENTA
    -- =========================

    insert into public.sale_items (
      sale_id,
      product_id,
      name,
      unit_price,
      unit_cost,
      quantity,
      subtotal,
      business_id
    )
    values (
      v_sale_id,
      v_product.id,
      v_product.name,
      v_product.sale_price,
      v_product.cost_price,
      v_quantity,
      v_product.sale_price * v_quantity,
      v_business_id
    );


    -- =========================
    -- DESCONTAR STOCK
    -- =========================

    update public.branch_inventory
    set
      stock = v_stock_after,
      updated_at = now()
    where business_id = v_business_id
      and branch_id = p_branch_id
      and product_id = v_product.id;


    -- =========================
    -- MOVIMIENTO INVENTARIO
    -- =========================

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reference_id,
      note,
      user_id,
      business_id,
      branch_id
    )
    values (
      v_product.id,
      'sale',
      -v_quantity,
      v_stock_before,
      v_stock_after,
      v_sale_id,
      'Venta ' || v_number,
      auth.uid(),
      v_business_id,
      p_branch_id
    );

  end loop;


  -- =========================
  -- TOTAL
  -- =========================

  v_total := v_subtotal;


  -- =========================
  -- PROCESAR PAGO
  -- =========================

  if p_payment_method = 'cash' then

    if p_paid_amount is null
       or p_paid_amount < v_total then
      raise exception
        'Efectivo insuficiente. Total: %, recibido: %',
        v_total,
        coalesce(p_paid_amount, 0);
    end if;

    v_paid_amount := p_paid_amount;
    v_change_due := p_paid_amount - v_total;

  elsif p_payment_method in ('card', 'transfer') then

    v_paid_amount := v_total;
    v_change_due := 0;

  end if;


  -- =========================
  -- FINALIZAR VENTA
  -- =========================

  update public.sales
  set
    subtotal = v_subtotal,
    total = v_total,
    paid_amount = v_paid_amount,
    change_due = v_change_due,
    payment_method = p_payment_method,
    updated_at = now()
  where id = v_sale_id
    and business_id = v_business_id
    and branch_id = p_branch_id;


  -- =========================
  -- RESPUESTA
  -- =========================

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'number', v_number,
    'cash_session_id', v_cash_session_id,
    'branch_id', p_branch_id,
    'subtotal', v_subtotal,
    'total', v_total,
    'paid_amount', v_paid_amount,
    'change_due', v_change_due,
    'payment_method', p_payment_method
  );

end;

$$;


--
-- Name: create_sale_return(uuid, jsonb, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_sale_return(p_sale_id uuid, p_items jsonb, p_request_id uuid, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
declare
  v_business_id uuid;
  v_sale public.sales%rowtype;
  v_return_id uuid := gen_random_uuid();

  v_item jsonb;
  v_sale_item public.sale_items%rowtype;

  v_quantity numeric;
  v_already_returned numeric;
  v_available_to_return numeric;

  v_item_subtotal numeric(12,2);
  v_total numeric(12,2) := 0;

  v_stock_before numeric(12,3);
  v_stock_after numeric(12,3);

  v_cash_session_id uuid;
  v_cash_sales numeric(12,2) := 0;
  v_income numeric(12,2) := 0;
  v_expense numeric(12,2) := 0;
  v_available_cash numeric(12,2) := 0;

  v_product_sale_unit text;
  v_product_name text;

  v_item_count integer;
  v_existing_response jsonb;
begin

  -- =========================
  -- SEGURIDAD
  -- =========================

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_active_user() then
    raise exception 'Usuario inactivo o sin autorización';
  end if;

  if not public.has_role(array['admin']) then
    raise exception
      'No tienes permisos para registrar devoluciones';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception
      'No se pudo determinar el negocio del usuario';
  end if;

  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite realizar devoluciones';
  end if;

  if p_request_id is null then
    raise exception 'request_id es obligatorio';
  end if;

  -- Serializa reintentos concurrentes de la misma solicitud.
  perform pg_advisory_xact_lock(
    hashtextextended(v_business_id::text || ':' || p_request_id::text, 0)
  );

  -- Si esta misma solicitud ya terminó, devolver el resultado existente
  -- sin volver a tocar inventario ni caja.
  select jsonb_build_object(
    'return_id', sr.id,
    'sale_id', sr.sale_id,
    'sale_number', s.number,
    'branch_id', sr.branch_id,
    'refund_method', sr.refund_method,
    'cash_session_id', sr.cash_session_id,
    'total', sr.total
  )
  into v_existing_response
  from public.sale_returns sr
  join public.sales s
    on s.id = sr.sale_id
   and s.business_id = sr.business_id
  where sr.business_id = v_business_id
    and sr.request_id = p_request_id;

  if v_existing_response is not null then
    if (v_existing_response->>'sale_id')::uuid <> p_sale_id then
      raise exception 'El request_id ya fue utilizado para otra venta';
    end if;

    return v_existing_response;
  end if;


  -- =========================
  -- VALIDAR SOLICITUD
  -- =========================

  if p_sale_id is null then
    raise exception 'La venta es obligatoria';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception
      'Debes seleccionar al menos un producto para devolver';
  end if;

  if jsonb_array_length(p_items) > 500 then
    raise exception
      'La devolución contiene demasiados productos';
  end if;


  -- =========================
  -- BLOQUEAR VENTA
  -- =========================

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
    and business_id = v_business_id
  for update;

  if not found then
    raise exception
      'La venta no existe o no pertenece a tu negocio';
  end if;

  if not public.has_branch_access(v_sale.branch_id) then
    raise exception
      'No tienes acceso a la sucursal donde se realizó esta venta';
  end if;

  if not exists (
    select 1
    from public.branches br
    where br.id = v_sale.branch_id
      and br.business_id = v_business_id
      and br.active = true
  ) then
    raise exception
      'La sucursal de la venta está inactiva';
  end if;


  -- =========================
  -- MÉTODO DE REEMBOLSO
  -- =========================

  if v_sale.payment_method not in ('cash', 'card', 'transfer') then
    raise exception
      'El método de pago de la venta no admite devolución';
  end if;


  -- =========================
  -- VALIDAR DUPLICADOS
  -- =========================

  select count(*)
  into v_item_count
  from (
    select value->>'sale_item_id'
    from jsonb_array_elements(p_items)
    group by value->>'sale_item_id'
  ) x;

  if v_item_count <> jsonb_array_length(p_items) then
    raise exception
      'No puedes enviar el mismo artículo más de una vez en la devolución';
  end if;


  -- =========================
  -- CREAR CABECERA
  -- =========================

  insert into public.sale_returns (
    id,
    business_id,
    branch_id,
    sale_id,
    request_id,
    cash_session_id,
    refund_method,
    total,
    reason,
    user_id
  )
  values (
    v_return_id,
    v_business_id,
    v_sale.branch_id,
    v_sale.id,
    p_request_id,
    null,
    v_sale.payment_method,
    0,
    nullif(trim(p_reason), ''),
    auth.uid()
  );


  -- =========================
  -- PROCESAR ARTÍCULOS
  -- =========================

  for v_item in
    select value
    from jsonb_array_elements(p_items)
    order by value->>'sale_item_id'
  loop

    if nullif(v_item->>'sale_item_id', '') is null then
      raise exception
        'Cada artículo debe incluir sale_item_id';
    end if;

    if nullif(v_item->>'quantity', '') is null then
      raise exception
        'Cada artículo debe incluir quantity';
    end if;

    begin
      v_quantity := (v_item->>'quantity')::numeric;
    exception
      when others then
        raise exception 'Cantidad inválida';
    end;

    if v_quantity is null
       or v_quantity <= 0
       or v_quantity = 'NaN'::numeric
       or v_quantity = 'Infinity'::numeric
       or v_quantity = '-Infinity'::numeric then
      raise exception 'Cantidad inválida';
    end if;

    if v_quantity <> round(v_quantity, 3) then
      raise exception
        'La cantidad no puede tener más de 3 decimales';
    end if;


    -- Artículo original de la venta.
    begin
      select *
      into strict v_sale_item
      from public.sale_items
      where id = (v_item->>'sale_item_id')::uuid
        and sale_id = v_sale.id
        and business_id = v_business_id
      for update;
    exception
      when invalid_text_representation then
        raise exception 'Identificador de artículo inválido';
      when no_data_found then
        raise exception
          'El artículo no pertenece a esta venta';
    end;


    if v_sale_item.product_id is null then
      raise exception
        'El producto "%" ya no está disponible para devolver inventario',
        v_sale_item.name;
    end if;


    -- Producto actual y unidad de venta.
    select
      p.sale_unit,
      p.name
    into
      v_product_sale_unit,
      v_product_name
    from public.products p
    where p.id = v_sale_item.product_id
      and p.business_id = v_business_id;

    if not found then
      raise exception
        'El producto "%" ya no pertenece al negocio',
        v_sale_item.name;
    end if;

    if v_product_sale_unit = 'piece'
       and v_quantity <> trunc(v_quantity) then
      raise exception
        'El producto "%" se vende por pieza y requiere una cantidad entera',
        v_sale_item.name;
    end if;


    -- Cuánto se ha devuelto previamente de este sale_item.
    select coalesce(sum(sri.quantity), 0)
    into v_already_returned
    from public.sale_return_items sri
    join public.sale_returns sr
      on sr.id = sri.return_id
    where sri.sale_item_id = v_sale_item.id
      and sr.business_id = v_business_id
      and sr.sale_id = v_sale.id;

    v_available_to_return :=
      v_sale_item.quantity - v_already_returned;

    if v_quantity > v_available_to_return then
      raise exception
        'No puedes devolver % unidades de "%". Disponible para devolución: %',
        v_quantity,
        v_sale_item.name,
        v_available_to_return;
    end if;


    -- Importe usando el precio histórico de la venta.
    v_item_subtotal :=
      round(v_sale_item.unit_price * v_quantity, 2);

    v_total :=
      round(v_total + v_item_subtotal, 2);


    -- =========================
    -- BLOQUEAR INVENTARIO
    -- =========================

    insert into public.branch_inventory (
      business_id,
      branch_id,
      product_id,
      stock,
      minimum_stock
    )
    values (
      v_business_id,
      v_sale.branch_id,
      v_sale_item.product_id,
      0,
      0
    )
    on conflict (branch_id, product_id)
    do nothing;

    select bi.stock
    into v_stock_before
    from public.branch_inventory bi
    where bi.business_id = v_business_id
      and bi.branch_id = v_sale.branch_id
      and bi.product_id = v_sale_item.product_id
    for update;

    if not found then
      raise exception
        'No se pudo obtener el inventario del producto "%" en la sucursal',
        v_sale_item.name;
    end if;

    v_stock_after :=
      v_stock_before + v_quantity;


    -- =========================
    -- DETALLE DEVOLUCIÓN
    -- =========================

    insert into public.sale_return_items (
      return_id,
      sale_item_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal
    )
    values (
      v_return_id,
      v_sale_item.id,
      v_sale_item.product_id,
      v_sale_item.name,
      v_quantity,
      v_sale_item.unit_price,
      v_item_subtotal
    );


    -- =========================
    -- DEVOLVER INVENTARIO
    -- =========================

    update public.branch_inventory
    set
      stock = v_stock_after,
      updated_at = now()
    where business_id = v_business_id
      and branch_id = v_sale.branch_id
      and product_id = v_sale_item.product_id;


    -- =========================
    -- MOVIMIENTO INVENTARIO
    -- =========================

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reference_id,
      note,
      user_id,
      business_id,
      branch_id
    )
    values (
      v_sale_item.product_id,
      'return',
      v_quantity,
      v_stock_before,
      v_stock_after,
      null,
      'Devolución de venta ' || coalesce(v_sale.number, v_sale.id::text),
      auth.uid(),
      v_business_id,
      v_sale.branch_id
    );

  end loop;


  -- =========================
  -- VALIDAR TOTAL
  -- =========================

  if v_total <= 0 then
    raise exception
      'El importe de la devolución debe ser mayor a cero';
  end if;


  -- =========================
  -- REEMBOLSO EN EFECTIVO
  -- =========================

  if v_sale.payment_method = 'cash' then

    -- Buscar y bloquear la caja abierta actual
    -- de la misma sucursal.
    select cs.id
    into v_cash_session_id
    from public.cash_sessions cs
    where cs.business_id = v_business_id
      and cs.branch_id = v_sale.branch_id
      and cs.status = 'open'
    order by cs.opened_at desc
    limit 1
    for update;

    if v_cash_session_id is null then
      raise exception
        'No hay una caja abierta en esta sucursal para realizar el reembolso en efectivo';
    end if;


    -- Ventas en efectivo de la caja actual.
    select coalesce(
      sum(
        coalesce(s.paid_amount, 0)
        - coalesce(s.change_due, 0)
      ),
      0
    )
    into v_cash_sales
    from public.sales s
    where s.cash_session_id = v_cash_session_id
      and s.business_id = v_business_id
      and s.branch_id = v_sale.branch_id
      and s.payment_method = 'cash';


    -- Entradas manuales.
    select coalesce(sum(cm.amount), 0)
    into v_income
    from public.cash_movements cm
    where cm.cash_session_id = v_cash_session_id
      and cm.business_id = v_business_id
      and cm.branch_id = v_sale.branch_id
      and cm.movement_type = 'income';


    -- Salidas, incluyendo devoluciones anteriores.
    select coalesce(sum(cm.amount), 0)
    into v_expense
    from public.cash_movements cm
    where cm.cash_session_id = v_cash_session_id
      and cm.business_id = v_business_id
      and cm.branch_id = v_sale.branch_id
      and cm.movement_type = 'expense';


    select
      coalesce(cs.opening_amount, 0)
      + v_cash_sales
      + v_income
      - v_expense
    into v_available_cash
    from public.cash_sessions cs
    where cs.id = v_cash_session_id
      and cs.business_id = v_business_id
      and cs.branch_id = v_sale.branch_id;


    if v_total > v_available_cash then
      raise exception
        'Fondos insuficientes para realizar la devolución. Disponible en caja: $%',
        round(v_available_cash, 2);
    end if;


    insert into public.cash_movements (
      cash_session_id,
      movement_type,
      amount,
      concept,
      reference_id,
      user_id,
      business_id,
      branch_id
    )
    values (
      v_cash_session_id,
      'expense',
      v_total,
      'Devolución de venta ' || coalesce(v_sale.number, v_sale.id::text),
      v_return_id,
      auth.uid(),
      v_business_id,
      v_sale.branch_id
    );

  end if;


  -- =========================
  -- FINALIZAR DEVOLUCIÓN
  -- =========================

  update public.sale_returns
  set
    total = v_total,
    cash_session_id = v_cash_session_id
  where id = v_return_id
    and business_id = v_business_id;


  -- =========================
  -- RESPUESTA
  -- =========================

  return jsonb_build_object(
    'return_id', v_return_id,
    'sale_id', v_sale.id,
    'sale_number', v_sale.number,
    'branch_id', v_sale.branch_id,
    'refund_method', v_sale.payment_method,
    'cash_session_id', v_cash_session_id,
    'total', v_total
  );

end;
$_$;


--
-- Name: current_branch_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_branch_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select br.id
  from public.branches br
  join public.profile_branches pb
    on pb.branch_id = br.id
  join public.profiles p
    on p.id = pb.profile_id
  join public.businesses b
    on b.id = p.business_id
  where p.id = auth.uid()
    and pb.profile_id = auth.uid()
    and pb.business_id = p.business_id
    and br.business_id = p.business_id
    and p.active = true
    and b.active = true
    and br.active = true
  order by
    br.is_main desc,
    br.name asc
  limit 1;
$$;


--
-- Name: current_business_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_business_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.business_id
  from public.profiles p
  join public.businesses b
    on b.id = p.business_id
  where p.id = auth.uid()
    and p.active = true
    and b.active = true;
$$;


--
-- Name: deactivate_branch(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deactivate_branch(p_branch_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
  v_branch public.branches%rowtype;
begin
  -- Usuario autenticado
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- Solo administradores
  if not public.has_role(array['admin']) then
    raise exception 'No tienes permisos para desactivar sucursales';
  end if;

  -- Suscripción operativa
  if not public.has_operational_subscription() then
    raise exception 'La suscripción no permite realizar esta operación';
  end if;

  -- Negocio actual
  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No hay un negocio activo disponible';
  end if;

  -- Buscar sucursal exclusivamente dentro del negocio actual
  select *
  into v_branch
  from public.branches
  where id = p_branch_id
    and business_id = v_business_id
  for update;

  if not found then
    raise exception 'La sucursal no existe o no pertenece a tu negocio';
  end if;

  -- La principal nunca puede desactivarse
  if v_branch.is_main then
    raise exception 'La sucursal principal no puede desactivarse';
  end if;

  -- Si ya está inactiva, no hacemos nada
  if not v_branch.active then
    return;
  end if;

  -- No permitir desactivar una sucursal con caja abierta
  if exists (
    select 1
    from public.cash_sessions cs
    where cs.branch_id = p_branch_id
      and cs.business_id = v_business_id
      and cs.status = 'open'
  ) then
    raise exception
      'No puedes desactivar una sucursal con una caja abierta';
  end if;

  -- No permitir desactivar una sucursal involucrada
  -- en transferencias de inventario pendientes.
  if exists (
    select 1
    from public.inventory_transfers it
    where it.business_id = v_business_id
      and it.status = 'in_transit'
      and (
        it.source_branch_id = p_branch_id
        or it.destination_branch_id = p_branch_id
      )
  ) then
    raise exception
      'No puedes desactivar una sucursal con transferencias de inventario pendientes';
  end if;

  -- Desactivar sin borrar historial
  update public.branches
  set
    active = false,
    updated_at = now()
  where id = p_branch_id
    and business_id = v_business_id;
end;
$$;


--
-- Name: finalize_pos_device_pairing_resolution(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_pos_device_pairing_resolution(p_challenge_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_device_id uuid;
  v_token_id uuid;
  v_token public.pos_device_pairing_tokens%ROWTYPE;
  v_now timestamptz;
  v_state text;
BEGIN
  IF p_challenge_id IS NULL THEN
    RETURN false;
  END IF;

  -- Identificar el dispositivo antes de bloquear.
  SELECT t.device_id
  INTO v_device_id
  FROM public.pos_device_pairing_challenges c
  JOIN public.pos_device_pairing_tokens t
    ON t.id = c.pairing_token_id
  WHERE c.id = p_challenge_id;

  IF v_device_id IS NULL THEN
    RETURN false;
  END IF;

  -- Utilizar exactamente la misma coordinación
  -- que la confirmación de vinculación.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pos-device-pairing:' || v_device_id::text,
      0
    )
  );

  -- La RPC de estado relee y bloquea token,
  -- dispositivo y desafío dentro de esta transacción.
  v_state :=
    public.resolve_pos_device_pairing_state(
      p_challenge_id
    );

  IF v_state IS DISTINCT FROM 'not_linked' THEN
    RETURN false;
  END IF;

  -- Recuperar el token del desafío original.
  SELECT t.*
  INTO v_token
  FROM public.pos_device_pairing_tokens t
  JOIN public.pos_device_pairing_challenges c
    ON c.pairing_token_id = t.id
  WHERE c.id = p_challenge_id
    AND t.device_id = v_device_id
  FOR UPDATE OF t;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_now := pg_catalog.clock_timestamp();

  -- Política conservadora:
  -- no liberar mientras el token original siga vigente.
  IF v_token.used_at IS NOT NULL
     OR v_token.expires_at > v_now
  THEN
    RETURN false;
  END IF;

  v_token_id := v_token.id;

  -- Invalidar definitivamente el token vencido.
  UPDATE public.pos_device_pairing_tokens
  SET used_at = v_now
  WHERE id = v_token_id
    AND used_at IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Cerrar todos los desafíos todavía pendientes
  -- asociados a ese mismo token.
  UPDATE public.pos_device_pairing_challenges
  SET used_at = v_now
  WHERE pairing_token_id = v_token_id
    AND used_at IS NULL;

  -- Registrar la finalización en la misma transacción.
  --
  -- Si este INSERT falla, PostgreSQL revierte también
  -- las actualizaciones del token y los desafíos.
  --
  -- No utilizar ON CONFLICT DO NOTHING: una colisión
  -- inesperada debe impedir confirmar la operación.
  INSERT INTO public.pos_device_pairing_resolutions (
    pairing_challenge_id,
    device_id,
    finalized_at
  )
  VALUES (
    p_challenge_id,
    v_device_id,
    v_now
  );

  RETURN true;
END;
$$;


--
-- Name: get_business_branches_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_business_branches_admin() RETURNS TABLE(id uuid, name text, code text, is_main boolean, active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
begin
  -- Usuario autenticado
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  -- Usuario activo
  if not public.is_active_user() then
    raise exception 'Usuario inactivo o sin autorización';
  end if;

  -- Solo administradores
  if not public.has_role(array['admin']) then
    raise exception 'No tienes permisos para administrar sucursales';
  end if;

  -- Negocio actual
  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  return query
  select
    br.id,
    br.name,
    br.code,
    br.is_main,
    br.active,
    br.created_at,
    br.updated_at
  from public.branches br
  where br.business_id = v_business_id
  order by
    br.is_main desc,
    br.active desc,
    br.name asc;
end;
$$;


--
-- Name: get_cash_movements(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_cash_movements(p_cash_session_id uuid) RETURNS TABLE(id uuid, cash_session_id uuid, movement_type text, amount numeric, concept text, reference_id uuid, created_at timestamp with time zone, user_id uuid, user_name text, user_role text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
  v_branch_id uuid;
begin

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_active_user() then
    raise exception 'Usuario inactivo o sin autorización';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  -- Obtener la sucursal directamente desde la sesión.
  select cs.branch_id
  into v_branch_id
  from public.cash_sessions cs
  where cs.id = p_cash_session_id
    and cs.business_id = v_business_id;

  if not found then
    raise exception
      'La sesión de caja no existe o no pertenece a tu negocio';
  end if;

  if v_branch_id is null then
    raise exception
      'La sesión de caja no tiene una sucursal asignada';
  end if;

  -- Para consultar movimientos históricos no importa
  -- si la sucursal está actualmente activa.
  if not public.has_branch_history_access(v_branch_id) then
    raise exception
      'No tienes acceso al historial de la sucursal de esta caja';
  end if;

  return query
  select
    cm.id,
    cm.cash_session_id,
    cm.movement_type,
    cm.amount,
    cm.concept,
    cm.reference_id,
    cm.created_at,
    cm.user_id,
    p.full_name as user_name,
    p.role as user_role
  from public.cash_movements cm

  left join public.profiles p
    on p.id = cm.user_id
    and p.business_id = v_business_id

  where cm.cash_session_id = p_cash_session_id
    and cm.business_id = v_business_id
    and cm.branch_id = v_branch_id

  order by cm.created_at desc;

end;
$$;


--
-- Name: get_cash_sessions_history(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_cash_sessions_history(p_branch_id uuid) RETURNS TABLE(id uuid, opened_at timestamp with time zone, closed_at timestamp with time zone, opening_amount numeric, closing_amount numeric, expected_amount numeric, difference numeric, status text, opened_by uuid, opened_by_name text, opened_by_role text, closed_by uuid, closed_by_name text, closed_by_role text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
begin

  -- Usuario autenticado
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  -- Usuario activo
  if not public.is_active_user() then
    raise exception 'Usuario inactivo o sin autorización';
  end if;

  -- Obtener negocio del usuario autenticado
  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  -- La sucursal es obligatoria
  if p_branch_id is null then
    raise exception 'La sucursal es obligatoria';
  end if;

  -- Para consultar historial no importa si la sucursal
  -- está actualmente activa o inactiva.
  if not public.has_branch_history_access(p_branch_id) then
    raise exception 'No tienes acceso al historial de esta sucursal';
  end if;

  -- La sucursal debe seguir perteneciendo al negocio.
  -- No exigimos active = true.
  if not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.business_id = v_business_id
  ) then
    raise exception 'Sucursal inválida';
  end if;

  return query
  select
    cs.id,
    cs.opened_at,
    cs.closed_at,
    cs.opening_amount,
    cs.closing_amount,
    cs.expected_amount,
    cs.difference,
    cs.status,

    cs.opened_by,
    opener.full_name as opened_by_name,
    opener.role as opened_by_role,

    cs.closed_by,
    closer.full_name as closed_by_name,
    closer.role as closed_by_role

  from public.cash_sessions cs

  left join public.profiles opener
    on opener.id = cs.opened_by
    and opener.business_id = v_business_id

  left join public.profiles closer
    on closer.id = cs.closed_by
    and closer.business_id = v_business_id

  where cs.business_id = v_business_id
    and cs.branch_id = p_branch_id

  order by cs.opened_at desc;

end;
$$;


--
-- Name: get_employees(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_employees() RETURNS TABLE(id uuid, full_name text, role text, active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, branch_ids uuid[])
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.has_role(array['admin']) then
    raise exception 'No tienes permisos para consultar empleados';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.role,
    p.active,
    p.created_at,
    p.updated_at,

    coalesce(
      array_agg(pb.branch_id)
        filter (
          where pb.branch_id is not null
            and b.active = true
        ),
      array[]::uuid[]
    ) as branch_ids

  from public.profiles p

  left join public.profile_branches pb
    on pb.profile_id = p.id
    and pb.business_id = v_business_id

  left join public.branches b
    on b.id = pb.branch_id
    and b.business_id = v_business_id

  where p.business_id = v_business_id

  group by
    p.id,
    p.full_name,
    p.role,
    p.active,
    p.created_at,
    p.updated_at

  order by p.full_name;
end;
$$;


--
-- Name: get_inventory_movements(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_inventory_movements(p_branch_id uuid) RETURNS TABLE(id uuid, product_id uuid, product_name text, product_barcode text, movement_type text, quantity integer, stock_before integer, stock_after integer, reference_id uuid, note text, created_at timestamp with time zone, user_id uuid, user_name text, user_role text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
begin

  -- Debe existir una sesión autenticada
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  -- El usuario debe estar activo
  if not public.is_active_user() then
    raise exception 'Usuario inactivo o sin autorización';
  end if;

  -- Obtener el negocio del usuario autenticado
  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  -- La sucursal es obligatoria
  if p_branch_id is null then
    raise exception 'La sucursal es obligatoria';
  end if;

  -- Para consultar movimientos históricos no importa
  -- si la sucursal está actualmente activa.
  if not public.has_branch_history_access(p_branch_id) then
    raise exception
      'No tienes acceso al historial de esta sucursal';
  end if;

  -- La sucursal debe pertenecer al negocio.
  -- No exigimos active = true.
  if not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.business_id = v_business_id
  ) then
    raise exception 'Sucursal inválida';
  end if;

  return query
  select
    im.id,
    im.product_id,
    p.name as product_name,
    p.barcode as product_barcode,
    im.movement_type,
    im.quantity,
    im.stock_before,
    im.stock_after,
    im.reference_id,
    im.note,
    im.created_at,
    im.user_id,
    pr.full_name as user_name,
    pr.role as user_role
  from public.inventory_movements im

  left join public.products p
    on p.id = im.product_id
    and p.business_id = v_business_id

  left join public.profiles pr
    on pr.id = im.user_id
    and pr.business_id = v_business_id

  where im.business_id = v_business_id
    and im.branch_id = p_branch_id

  order by im.created_at desc;

end;
$$;


--
-- Name: get_my_branches(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_branches() RETURNS TABLE(id uuid, name text, code text, is_main boolean, active boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
begin

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_active_user() then
    raise exception 'Usuario inactivo o sin autorización';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  return query
  select
    br.id,
    br.name,
    br.code,
    br.is_main,
    br.active
  from public.branches br
  join public.profile_branches pb
    on pb.branch_id = br.id
   and pb.profile_id = auth.uid()
  where br.business_id = v_business_id
    and pb.business_id = v_business_id
    and br.active = true
  order by
    br.is_main desc,
    br.name asc;

end;
$$;


--
-- Name: get_my_branches_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_branches_history() RETURNS TABLE(id uuid, name text, code text, is_main boolean, active boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
begin

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_active_user() then
    raise exception 'Usuario inactivo o sin autorización';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  return query
  select
    br.id,
    br.name,
    br.code,
    br.is_main,
    br.active
  from public.branches br
  join public.profile_branches pb
    on pb.branch_id = br.id
   and pb.profile_id = auth.uid()
   and pb.business_id = v_business_id
  where br.business_id = v_business_id
  order by
    br.active desc,
    br.is_main desc,
    br.name asc;

end;
$$;


--
-- Name: get_my_subscription(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_subscription() RETURNS TABLE(plan_name text, plan_slug text, status text, max_users integer, max_products integer, max_branches integer, current_users bigint, current_products bigint, current_branches bigint, starts_at timestamp with time zone, trial_ends_at timestamp with time zone, current_period_ends_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
begin
  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No hay un negocio activo disponible';
  end if;

  return query
  select
    p.name,
    p.slug,
    s.status,

    p.max_users,
    p.max_products,
    p.max_branches,

    (
      select count(*)
      from public.profiles pr
      where pr.business_id = v_business_id
    ),

    (
      select count(*)
      from public.products prd
      where prd.business_id = v_business_id
    ),

    (
      select count(*)
      from public.branches br
      where br.business_id = v_business_id
        and br.active = true
    ),

    s.starts_at,
    s.trial_ends_at,
    s.current_period_ends_at

  from public.subscriptions s
  join public.plans p
    on p.id = s.plan_id

  where s.business_id = v_business_id

  limit 1;
end;
$$;


--
-- Name: get_platform_business_activity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_platform_business_activity(target_business_id uuid) RETURNS TABLE(last_sale_at timestamp with time zone, sales_today bigint, total_today numeric, sales_last_30_days bigint, total_last_30_days numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  business_timezone text;
  business_today date;
  today_start timestamptz;
  tomorrow_start timestamptz;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Acceso denegado';
  end if;

  select b.timezone
  into business_timezone
  from public.businesses b
  where b.id = target_business_id;

  if business_timezone is null then
    raise exception 'Negocio no encontrado';
  end if;

  /*
    Calculamos qué fecha es actualmente
    en la zona horaria del negocio.
  */
  business_today :=
    (now() at time zone business_timezone)::date;

  /*
    Convertimos la medianoche local del negocio
    a timestamptz para compararla correctamente
    contra sales.created_at.
  */
  today_start :=
    business_today::timestamp
    at time zone business_timezone;

  tomorrow_start :=
    (business_today + 1)::timestamp
    at time zone business_timezone;

  return query
  select
    max(s.created_at) as last_sale_at,

    count(*) filter (
      where s.created_at >= today_start
        and s.created_at < tomorrow_start
    )::bigint as sales_today,

    coalesce(
      sum(s.total) filter (
        where s.created_at >= today_start
          and s.created_at < tomorrow_start
      ),
      0
    )::numeric as total_today,

    count(*) filter (
      where s.created_at >= now() - interval '30 days'
    )::bigint as sales_last_30_days,

    coalesce(
      sum(s.total) filter (
        where s.created_at >= now() - interval '30 days'
      ),
      0
    )::numeric as total_last_30_days

  from public.sales s
  where s.business_id = target_business_id;
end;
$$;


--
-- Name: get_platform_business_detail(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_platform_business_detail(target_business_id uuid) RETURNS TABLE(id uuid, name text, slug text, active boolean, timezone text, created_at timestamp with time zone, users_count bigint, products_count bigint, sales_count bigint, total_sales numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Acceso denegado';
  end if;

  if not exists (
    select 1
    from public.businesses b
    where b.id = target_business_id
  ) then
    raise exception 'Negocio no encontrado';
  end if;

  return query
  select
    b.id,
    b.name,
    b.slug,
    b.active,
    b.timezone,
    b.created_at,

    (
      select count(*)
      from public.profiles p
      where p.business_id = b.id
    )::bigint as users_count,

    (
      select count(*)
      from public.products p
      where p.business_id = b.id
    )::bigint as products_count,

    (
      select count(*)
      from public.sales s
      where s.business_id = b.id
    )::bigint as sales_count,

    coalesce(
      (
        select sum(s.total)
        from public.sales s
        where s.business_id = b.id
      ),
      0
    )::numeric as total_sales

  from public.businesses b
  where b.id = target_business_id;
end;
$$;


--
-- Name: get_platform_business_subscription(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_platform_business_subscription(target_business_id uuid) RETURNS TABLE(subscription_id uuid, plan_id uuid, plan_name text, plan_slug text, status text, max_users integer, max_products integer, current_users bigint, current_products bigint, starts_at timestamp with time zone, trial_ends_at timestamp with time zone, current_period_ends_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.is_platform_admin() then
    raise exception 'No tienes permisos para consultar esta suscripción';
  end if;

  if not exists (
    select 1
    from public.businesses b
    where b.id = target_business_id
  ) then
    raise exception 'El negocio no existe';
  end if;

  return query
  select
    s.id,
    p.id,
    p.name,
    p.slug,
    s.status,
    p.max_users,
    p.max_products,

    (
      select count(*)
      from public.profiles pr
      where pr.business_id = target_business_id
    ),

    (
      select count(*)
      from public.products prd
      where prd.business_id = target_business_id
    ),

    s.starts_at,
    s.trial_ends_at,
    s.current_period_ends_at

  from public.subscriptions s
  join public.plans p
    on p.id = s.plan_id

  where s.business_id = target_business_id

  limit 1;
end;
$$;


--
-- Name: get_platform_business_users(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_platform_business_users(target_business_id uuid) RETURNS TABLE(id uuid, full_name text, role text, active boolean, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Acceso denegado';
  end if;

  if not exists (
    select 1
    from public.businesses b
    where b.id = target_business_id
  ) then
    raise exception 'Negocio no encontrado';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.role,
    p.active,
    p.created_at
  from public.profiles p
  where p.business_id = target_business_id
  order by
    p.active desc,
    p.created_at asc;
end;
$$;


--
-- Name: get_platform_businesses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_platform_businesses() RETURNS TABLE(id uuid, name text, slug text, active boolean, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Acceso denegado';
  end if;

  return query
  select
    b.id,
    b.name,
    b.slug,
    b.active,
    b.created_at
  from public.businesses b
  order by b.created_at desc;
end;
$$;


--
-- Name: get_platform_plans(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_platform_plans() RETURNS TABLE(id uuid, name text, slug text, max_users integer, max_products integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.is_platform_admin() then
    raise exception 'No tienes permisos para consultar los planes';
  end if;

  return query
  select
    p.id,
    p.name,
    p.slug,
    p.max_users,
    p.max_products
  from public.plans p
  where p.active = true
  order by
    case p.slug
      when 'free' then 1
      when 'pro' then 2
      when 'business' then 3
      else 100
    end,
    p.name;
end;
$$;


--
-- Name: get_product_costs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_product_costs() RETURNS TABLE(id uuid, cost_price numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
begin
  -- 1. Debe existir una sesión autenticada
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  -- 2. Solo admin o manager activo
  if not public.has_role(array['admin', 'manager']) then
    raise exception 'No tienes permisos para consultar costos';
  end if;

  -- 3. Obtener el tenant desde el usuario autenticado
  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  -- 4. Solo devolver costos del negocio actual
  return query
  select
    p.id,
    p.cost_price
  from public.products p
  where p.business_id = v_business_id;
end;
$$;


--
-- Name: get_sale_item_costs(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_sale_item_costs(p_sale_ids uuid[]) RETURNS TABLE(sale_id uuid, product_id uuid, unit_cost numeric, quantity numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_business_id uuid;
BEGIN
  -- 1. Usuario autenticado
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  -- 2. Solo admin o manager activo
  IF NOT public.has_role(ARRAY['admin', 'manager']) THEN
    RAISE EXCEPTION 'No tienes permisos para consultar costos';
  END IF;

  -- 3. Obtener tenant desde la sesión
  v_business_id := public.current_business_id();

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el negocio del usuario';
  END IF;

  -- 4. Solo items de ventas pertenecientes al negocio actual
  RETURN QUERY
  SELECT
    si.sale_id,
    si.product_id,
    si.unit_cost,
    si.quantity
  FROM public.sale_items si
  WHERE si.sale_id = ANY(p_sale_ids)
    AND si.business_id = v_business_id;
END;
$$;


--
-- Name: get_sale_return_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_sale_return_details(p_sale_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_user_id uuid;
  v_business_id uuid;
  v_role text;

  v_sale public.sales%rowtype;
  v_branch_active boolean;

  v_items jsonb;
  v_total_returned numeric(12,2);
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  select
    p.business_id,
    p.role
  into
    v_business_id,
    v_role
  from public.profiles p
  where p.id = v_user_id
    and p.active = true;

  if v_business_id is null then
    raise exception 'Usuario o negocio no válido';
  end if;

  if v_role <> 'admin' then
    raise exception 'No tienes permisos para consultar devoluciones';
  end if;

  select s.*
  into v_sale
  from public.sales s
  where s.id = p_sale_id
    and s.business_id = v_business_id;

  if not found then
    raise exception 'Venta no encontrada';
  end if;

  if not public.has_branch_history_access(v_sale.branch_id) then
    raise exception 'No tienes acceso al historial de esta sucursal';
  end if;

  select b.active
  into v_branch_active
  from public.branches b
  where b.id = v_sale.branch_id
    and b.business_id = v_business_id;

  if v_branch_active is null then
    raise exception 'Sucursal no encontrada';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sale_item_id', x.sale_item_id,
        'product_id', x.product_id,
        'product_name', x.product_name,
        'sale_unit', x.sale_unit,
        'sold_quantity', x.sold_quantity,
        'returned_quantity', x.returned_quantity,
        'available_quantity', x.available_quantity,
        'unit_price', x.unit_price,
        'available_amount',
          round(x.unit_price * x.available_quantity, 2),
        'returnable',
          (
            x.product_id is not null
            and x.product_exists = true
            and x.available_quantity > 0
          )
      )
      order by x.product_name, x.sale_item_id
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      si.id as sale_item_id,
      si.product_id,
      si.name as product_name,

      coalesce(pr.sale_unit, 'piece') as sale_unit,

      si.quantity::numeric as sold_quantity,

      coalesce(
        (
          select sum(sri.quantity)
          from public.sale_return_items sri
          join public.sale_returns sr
            on sr.id = sri.return_id
          where sri.sale_item_id = si.id
            and sr.business_id = v_business_id
        ),
        0
      )::numeric as returned_quantity,

      greatest(
        si.quantity -
        coalesce(
          (
            select sum(sri.quantity)
            from public.sale_return_items sri
            join public.sale_returns sr
              on sr.id = sri.return_id
            where sri.sale_item_id = si.id
              and sr.business_id = v_business_id
          ),
          0
        ),
        0
      )::numeric as available_quantity,

      si.unit_price::numeric as unit_price,

      (pr.id is not null) as product_exists

    from public.sale_items si
    left join public.products pr
      on pr.id = si.product_id
     and pr.business_id = v_business_id
    where si.sale_id = v_sale.id
      and si.business_id = v_business_id
  ) x;

  select coalesce(sum(sr.total), 0)
  into v_total_returned
  from public.sale_returns sr
  where sr.sale_id = v_sale.id
    and sr.business_id = v_business_id;

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'sale_number', v_sale.number,
    'branch_id', v_sale.branch_id,
    'branch_active', v_branch_active,
    'payment_method', v_sale.payment_method,
    'sale_total', v_sale.total,
    'total_refunded', v_total_returned,
    'remaining_refundable_amount',
      greatest(v_sale.total - v_total_returned, 0),
    'can_create_return',
      (
        v_branch_active = true
        and public.has_branch_access(v_sale.branch_id)
        and exists (
          select 1
          from public.sale_items si
          where si.sale_id = v_sale.id
            and si.business_id = v_business_id
            and si.product_id is not null
            and exists (
              select 1
              from public.products pr
              where pr.id = si.product_id
                and pr.business_id = v_business_id
            )
            and si.quantity >
              coalesce(
                (
                  select sum(sri.quantity)
                  from public.sale_return_items sri
                  join public.sale_returns sr
                    on sr.id = sri.return_id
                  where sri.sale_item_id = si.id
                    and sr.business_id = v_business_id
                ),
                0
              )
        )
      ),
    'items', v_items
  );
end;
$$;


--
-- Name: get_sales_history(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_sales_history(p_branch_id uuid) RETURNS TABLE(id uuid, number text, subtotal numeric, discount numeric, total numeric, paid_amount numeric, change_due numeric, payment_method text, created_at timestamp with time zone, user_id uuid, user_name text, user_role text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
begin

  -- Debe existir una sesión autenticada
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  -- El usuario debe estar activo
  if not public.is_active_user() then
    raise exception 'Usuario inactivo o sin autorización';
  end if;

  -- Obtener el negocio del usuario autenticado
  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  -- La sucursal es obligatoria
  if p_branch_id is null then
    raise exception 'La sucursal es obligatoria';
  end if;

  -- Para historial no importa si la sucursal está inactiva.
  -- El usuario sí debe conservar una asignación a ella.
  if not public.has_branch_history_access(p_branch_id) then
    raise exception 'No tienes acceso al historial de esta sucursal';
  end if;

  -- La sucursal debe pertenecer al negocio.
  -- No exigimos active = true porque puede ser una sucursal cerrada.
  if not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.business_id = v_business_id
  ) then
    raise exception 'Sucursal inválida';
  end if;

  return query
  select
    s.id,
    s.number,
    s.subtotal,
    s.discount,
    s.total,
    s.paid_amount,
    s.change_due,
    s.payment_method,
    s.created_at,
    s.user_id,
    p.full_name as user_name,
    p.role as user_role
  from public.sales s

  left join public.profiles p
    on p.id = s.user_id
    and p.business_id = v_business_id

  where s.business_id = v_business_id
    and s.branch_id = p_branch_id

  order by s.created_at desc;

end;
$$;


--
-- Name: has_branch_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_branch_access(p_branch_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profile_branches pb
    join public.profiles p
      on p.id = pb.profile_id
    join public.branches br
      on br.id = pb.branch_id
    join public.businesses b
      on b.id = pb.business_id
    where pb.profile_id = auth.uid()
      and pb.branch_id = p_branch_id
      and pb.business_id = p.business_id
      and br.business_id = p.business_id
      and p.active = true
      and br.active = true
      and b.active = true
  );
$$;


--
-- Name: has_branch_history_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_branch_history_access(p_branch_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profile_branches pb
    join public.profiles p
      on p.id = pb.profile_id
    join public.branches br
      on br.id = pb.branch_id
    join public.businesses b
      on b.id = pb.business_id
    where pb.profile_id = auth.uid()
      and pb.branch_id = p_branch_id
      and pb.business_id = p.business_id
      and br.business_id = p.business_id
      and p.active = true
      and b.active = true
  );
$$;


--
-- Name: has_operational_subscription(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_operational_subscription() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles pr
    join public.businesses b
      on b.id = pr.business_id
    join public.subscriptions s
      on s.business_id = pr.business_id
    join public.plans p
      on p.id = s.plan_id
    where pr.id = auth.uid()
      and pr.active = true
      and b.active = true
      and p.active = true
      and s.status in ('trialing', 'active', 'past_due')
  );
$$;


--
-- Name: has_role(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(allowed_roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    join public.businesses b
      on b.id = p.business_id
    where p.id = auth.uid()
      and p.active = true
      and b.active = true
      and p.role = any(allowed_roles)
  );
$$;


--
-- Name: is_active_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_active_user() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    join public.businesses b
      on b.id = p.business_id
    where p.id = auth.uid()
      and p.active = true
      and b.active = true
  );
$$;


--
-- Name: is_platform_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  );
$$;


--
-- Name: open_cash_session(numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_cash_session(p_opening_amount numeric, p_branch_id uuid) RETURNS public.cash_sessions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_session public.cash_sessions%rowtype;
  v_business_id uuid;
begin

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_active_user() then
    raise exception 'Usuario inactivo';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite realizar operaciones de caja';
  end if;

  if p_branch_id is null then
    raise exception 'La sucursal es obligatoria';
  end if;

  -- El usuario debe tener acceso a la sucursal.
  if not public.has_branch_access(p_branch_id) then
    raise exception
      'No tienes acceso a esta sucursal';
  end if;

  -- Defensa adicional:
  -- la sucursal debe estar activa y pertenecer al negocio actual.
  if not exists (
    select 1
    from public.branches br
    where br.id = p_branch_id
      and br.business_id = v_business_id
      and br.active = true
  ) then
    raise exception
      'La sucursal no existe, está inactiva o no pertenece a tu negocio';
  end if;

  if p_opening_amount is null or p_opening_amount < 0 then
    raise exception 'El fondo inicial no puede ser negativo';
  end if;

  -- Ahora permitimos una caja abierta POR SUCURSAL.
  if exists (
    select 1
    from public.cash_sessions cs
    where cs.status = 'open'
      and cs.business_id = v_business_id
      and cs.branch_id = p_branch_id
  ) then
    raise exception
      'Ya existe una caja abierta para esta sucursal';
  end if;

  insert into public.cash_sessions (
    opening_amount,
    status,
    opened_by,
    business_id,
    branch_id
  )
  values (
    p_opening_amount,
    'open',
    auth.uid(),
    v_business_id,
    p_branch_id
  )
  returning *
  into v_session;

  return v_session;

end;
$$;


--
-- Name: reactivate_branch(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reactivate_branch(p_branch_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
  v_branch public.branches%rowtype;
  v_max_branches integer;
  v_active_branches integer;
begin
  -- Usuario autenticado
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- Solo administradores
  if not public.has_role(array['admin']) then
    raise exception 'No tienes permisos para reactivar sucursales';
  end if;

  -- Suscripción operativa
  if not public.has_operational_subscription() then
    raise exception 'La suscripción no permite realizar esta operación';
  end if;

  -- Negocio actual
  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No hay un negocio activo disponible';
  end if;

  -- Buscar sucursal dentro del negocio actual
  select *
  into v_branch
  from public.branches
  where id = p_branch_id
    and business_id = v_business_id
  for update;

  if not found then
    raise exception 'La sucursal no existe o no pertenece a tu negocio';
  end if;

  -- Si ya está activa, no hacemos nada
  if v_branch.active then
    return;
  end if;

  -- Obtener límite de sucursales del plan actual
  select p.max_branches
  into v_max_branches
  from public.subscriptions s
  join public.plans p
    on p.id = s.plan_id
  where s.business_id = v_business_id
    and s.status in ('active', 'trialing', 'past_due')
  limit 1;

  if v_max_branches is null then
    raise exception 'No se pudo determinar el límite de sucursales del plan';
  end if;

  -- Contar únicamente sucursales activas
  select count(*)
  into v_active_branches
  from public.branches
  where business_id = v_business_id
    and active = true;

  -- Reactivar también debe respetar el plan
  if v_active_branches >= v_max_branches then
    raise exception
      'Has alcanzado el límite de % sucursales activas permitido por tu plan',
      v_max_branches;
  end if;

  -- Reactivar
  update public.branches
  set
    active = true,
    updated_at = now()
  where id = p_branch_id
    and business_id = v_business_id;
end;
$$;


--
-- Name: receive_inventory_transfer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.receive_inventory_transfer(p_transfer_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_business_id uuid;
  v_user_id uuid;
  v_transfer public.inventory_transfers%rowtype;
  v_inventory public.branch_inventory%rowtype;
  v_item record;
begin
  v_user_id := auth.uid();
  v_business_id := public.current_business_id();

  if v_user_id is null or v_business_id is null then
    raise exception 'No hay un usuario y negocio activos';
  end if;

  if not coalesce(
    public.can_manage_inventory_transfers(),
    false
  ) then
    raise exception 'No tienes permiso para gestionar transferencias';
  end if;

  select t.*
  into v_transfer
  from public.inventory_transfers t
  where t.id = p_transfer_id
    and t.business_id = v_business_id
  for update;

  if not found then
    raise exception 'Transferencia no encontrada';
  end if;

  if not coalesce(
    public.has_branch_access(v_transfer.destination_branch_id),
    false
  ) then
    raise exception 'No tienes acceso a la sucursal destino activa';
  end if;

  -- Reintentar una recepción exitosa no vuelve a sumar stock.
  if v_transfer.status = 'received' then
    return v_transfer.id;
  end if;

  if v_transfer.status <> 'in_transit' then
    raise exception 'La transferencia no está en tránsito';
  end if;

  if not exists (
    select 1
    from public.inventory_transfer_items i
    where i.transfer_id = p_transfer_id
  ) then
    raise exception 'La transferencia no contiene productos';
  end if;

  for v_item in
    select i.*
    from public.inventory_transfer_items i
    where i.transfer_id = p_transfer_id
    order by i.product_id
  loop
    perform 1
    from public.products p
    where p.id = v_item.product_id
      and p.business_id = v_business_id
    for share;

    if not found then
      raise exception 'El producto no pertenece al negocio';
    end if;

    -- Si el producto aún no tiene inventario en destino,
    -- se crea con stock y mínimo en cero.
    insert into public.branch_inventory (
      business_id,
      branch_id,
      product_id,
      stock,
      minimum_stock
    )
    values (
      v_business_id,
      v_transfer.destination_branch_id,
      v_item.product_id,
      0,
      0
    )
    on conflict (branch_id, product_id) do nothing;

    select bi.*
    into v_inventory
    from public.branch_inventory bi
    where bi.branch_id = v_transfer.destination_branch_id
      and bi.product_id = v_item.product_id
    for update;

    if not found then
      raise exception 'No se pudo obtener el inventario destino';
    end if;

    if v_inventory.business_id <> v_business_id then
      raise exception 'El inventario destino no pertenece al negocio';
    end if;

    update public.branch_inventory
    set stock = stock + v_item.quantity,
        updated_at = now()
    where id = v_inventory.id;

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reference_id,
      note,
      user_id,
      business_id,
      branch_id
    )
    values (
      v_item.product_id,
      'transfer_in',
      v_item.quantity,
      v_inventory.stock,
      v_inventory.stock + v_item.quantity,
      p_transfer_id,
      'Recepción de transferencia entre sucursales',
      v_user_id,
      v_business_id,
      v_transfer.destination_branch_id
    );
  end loop;

  update public.inventory_transfers
  set status = 'received',
      received_by = v_user_id,
      received_at = now()
  where id = p_transfer_id;

  return p_transfer_id;
end;
$$;


--
-- Name: cash_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cash_session_id uuid NOT NULL,
    movement_type text NOT NULL,
    amount numeric(12,2) NOT NULL,
    concept text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reference_id uuid,
    user_id uuid,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    CONSTRAINT cash_movements_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT cash_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['income'::text, 'expense'::text])))
);


--
-- Name: register_cash_movement(uuid, text, numeric, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_cash_movement(p_cash_session_id uuid, p_movement_type text, p_amount numeric, p_concept text, p_reference_id uuid DEFAULT NULL::uuid) RETURNS public.cash_movements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_session public.cash_sessions%rowtype;
  v_business_id uuid;
  v_branch_id uuid;

  v_cash_sales numeric := 0;
  v_income numeric := 0;
  v_expense numeric := 0;
  v_available numeric := 0;

  v_movement public.cash_movements%rowtype;
begin

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_active_user() then
    raise exception 'Usuario inactivo';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite realizar operaciones de caja';
  end if;

  if p_movement_type not in ('income', 'expense') then
    raise exception 'Tipo de movimiento no válido';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  if nullif(trim(p_concept), '') is null then
    raise exception 'El concepto es obligatorio';
  end if;

  -- Obtener y bloquear la caja.
  select *
  into v_session
  from public.cash_sessions
  where id = p_cash_session_id
    and business_id = v_business_id
  for update;

  if not found then
    raise exception
      'La sesión de caja no existe o no pertenece a tu negocio';
  end if;

  if v_session.status <> 'open' then
    raise exception 'La caja está cerrada';
  end if;

  v_branch_id := v_session.branch_id;

  if v_branch_id is null then
    raise exception
      'La sesión de caja no tiene una sucursal asignada';
  end if;

  -- El usuario debe tener acceso a la sucursal de la caja.
  if not public.has_branch_access(v_branch_id) then
    raise exception
      'No tienes acceso a la sucursal de esta caja';
  end if;

  -- Ventas en efectivo de esta caja.
  select coalesce(
    sum(
      coalesce(paid_amount, 0)
      - coalesce(change_due, 0)
    ),
    0
  )
  into v_cash_sales
  from public.sales
  where cash_session_id = p_cash_session_id
    and business_id = v_business_id
    and branch_id = v_branch_id
    and payment_method = 'cash';

  -- Entradas manuales de esta caja.
  select coalesce(sum(amount), 0)
  into v_income
  from public.cash_movements
  where cash_session_id = p_cash_session_id
    and business_id = v_business_id
    and branch_id = v_branch_id
    and movement_type = 'income';

  -- Salidas manuales de esta caja.
  select coalesce(sum(amount), 0)
  into v_expense
  from public.cash_movements
  where cash_session_id = p_cash_session_id
    and business_id = v_business_id
    and branch_id = v_branch_id
    and movement_type = 'expense';

  v_available :=
    coalesce(v_session.opening_amount, 0)
    + v_cash_sales
    + v_income
    - v_expense;

  if p_movement_type = 'expense'
     and p_amount > v_available then
    raise exception
      'Fondos insuficientes. Disponible en caja: $%',
      round(v_available, 2);
  end if;

  -- El movimiento hereda la sucursal de la caja.
  insert into public.cash_movements (
    cash_session_id,
    movement_type,
    amount,
    concept,
    reference_id,
    user_id,
    business_id,
    branch_id
  )
  values (
    p_cash_session_id,
    p_movement_type,
    p_amount,
    trim(p_concept),
    p_reference_id,
    auth.uid(),
    v_business_id,
    v_branch_id
  )
  returning *
  into v_movement;

  return v_movement;

end;
$_$;


--
-- Name: offline_sale_conflicts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offline_sale_conflicts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    cash_session_id uuid,
    sale_id uuid NOT NULL,
    payload jsonb NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    CONSTRAINT offline_sale_conflicts_payload_object_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT offline_sale_conflicts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'resolved'::text, 'discarded'::text])))
);


--
-- Name: register_offline_sale_conflict(uuid, uuid, uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_offline_sale_conflict(p_sale_id uuid, p_branch_id uuid, p_cash_session_id uuid, p_payload jsonb, p_reason text) RETURNS public.offline_sale_conflicts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_business_id uuid;
    v_existing public.offline_sale_conflicts%ROWTYPE;
    v_result public.offline_sale_conflicts%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_active_user() THEN
        RAISE EXCEPTION 'Usuario no autorizado';
    END IF;

    v_business_id := public.current_business_id();

    IF v_business_id IS NULL
       OR NOT public.has_operational_subscription() THEN
        RAISE EXCEPTION 'Negocio sin autorización operativa';
    END IF;

    IF p_sale_id IS NULL OR p_branch_id IS NULL THEN
        RAISE EXCEPTION 'Venta y sucursal obligatorias';
    END IF;

    IF NOT public.has_branch_access(p_branch_id)
       OR NOT EXISTS (
           SELECT 1
           FROM public.branches
           WHERE id = p_branch_id
             AND business_id = v_business_id
             AND active = true
       ) THEN
        RAISE EXCEPTION 'Sucursal no autorizada';
    END IF;

    IF p_cash_session_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM public.cash_sessions
           WHERE id = p_cash_session_id
             AND business_id = v_business_id
             AND branch_id = p_branch_id
       ) THEN
        RAISE EXCEPTION 'La caja no corresponde a la sucursal';
    END IF;

    IF p_payload IS NULL
       OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'Datos de venta inválidos';
    END IF;

    IF p_reason NOT IN (
        'insufficient_stock',
        'cash_session_closed',
        'invalid_product',
        'validation_error'
    ) THEN
        RAISE EXCEPTION 'Motivo de conflicto no permitido';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.sales
        WHERE id = p_sale_id
          AND business_id = v_business_id
    ) THEN
        RAISE EXCEPTION 'La venta ya está sincronizada';
    END IF;

    SELECT *
    INTO v_existing
    FROM public.offline_sale_conflicts
    WHERE business_id = v_business_id
      AND sale_id = p_sale_id;

    IF FOUND THEN
        IF v_existing.branch_id IS DISTINCT FROM p_branch_id
           OR v_existing.cash_session_id IS DISTINCT FROM p_cash_session_id
           OR v_existing.payload IS DISTINCT FROM p_payload
           OR v_existing.reason IS DISTINCT FROM p_reason THEN
            RAISE EXCEPTION 'El UUID ya existe con datos diferentes';
        END IF;

        RETURN v_existing;
    END IF;

    INSERT INTO public.offline_sale_conflicts (
        business_id,
        branch_id,
        cash_session_id,
        sale_id,
        payload,
        reason
    )
    VALUES (
        v_business_id,
        p_branch_id,
        p_cash_session_id,
        p_sale_id,
        p_payload,
        p_reason
    )
    ON CONFLICT (business_id, sale_id) DO NOTHING
    RETURNING *
    INTO v_result;

    IF v_result.id IS NULL THEN
        SELECT *
        INTO v_result
        FROM public.offline_sale_conflicts
        WHERE business_id = v_business_id
          AND sale_id = p_sale_id;

        IF v_result.branch_id IS DISTINCT FROM p_branch_id
           OR v_result.cash_session_id IS DISTINCT FROM p_cash_session_id
           OR v_result.payload IS DISTINCT FROM p_payload
           OR v_result.reason IS DISTINCT FROM p_reason THEN
            RAISE EXCEPTION 'El UUID ya existe con datos diferentes';
        END IF;
    END IF;

    RETURN v_result;
END;
$$;


--
-- Name: register_pos_device(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_pos_device(p_branch_id uuid, p_name text, p_platform text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
    v_user_id uuid;
    v_business_id uuid;
    v_device_id uuid;
    v_name text;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL
       OR NOT public.is_active_user() THEN
        RAISE EXCEPTION 'Usuario no autorizado';
    END IF;

    IF NOT public.has_role(ARRAY['admin']) THEN
        RAISE EXCEPTION
            'Solo un administrador puede registrar dispositivos';
    END IF;

    IF NOT public.has_operational_subscription() THEN
        RAISE EXCEPTION
            'La suscripción no permite registrar dispositivos';
    END IF;

    v_business_id := public.current_business_id();

    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Negocio no disponible';
    END IF;

    IF p_branch_id IS NULL
       OR NOT public.has_branch_access(p_branch_id) THEN
        RAISE EXCEPTION
            'No tienes acceso a esta sucursal';
    END IF;

    v_name := NULLIF(btrim(p_name), '');

    IF v_name IS NULL OR length(v_name) > 100 THEN
        RAISE EXCEPTION
            'El nombre debe tener entre 1 y 100 caracteres';
    END IF;

    IF p_platform IS NULL
       OR p_platform NOT IN ('android', 'ios') THEN
        RAISE EXCEPTION 'Plataforma no válida';
    END IF;

    INSERT INTO public.pos_devices (
        business_id,
        branch_id,
        registered_by,
        name,
        platform,
        status
    )
    VALUES (
        v_business_id,
        p_branch_id,
        v_user_id,
        v_name,
        p_platform,
        'active'
    )
    RETURNING id INTO v_device_id;

    RETURN v_device_id;
END;
$$;


--
-- Name: register_purchase(text, uuid, text, jsonb, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_purchase(p_number text, p_supplier_id uuid, p_notes text, p_items jsonb, p_cash_session_id uuid DEFAULT NULL::uuid, p_branch_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_purchase_id uuid;
  v_business_id uuid;

  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_unit_cost numeric(12,2);

  v_product_name text;
  v_stock_before integer;
  v_stock_after integer;

  v_subtotal numeric(12,2) := 0;

  v_cash_status text;
  v_cash_branch_id uuid;

begin

  -- ==========================================
  -- SEGURIDAD
  -- ==========================================

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.has_role(array['admin', 'manager']) then
    raise exception 'No tienes permisos para registrar compras';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite realizar operaciones de compras';
  end if;


  -- ==========================================
  -- VALIDAR SUCURSAL
  -- ==========================================

  if p_branch_id is null then
    raise exception 'La sucursal es obligatoria';
  end if;

  if not public.has_branch_access(p_branch_id) then
    raise exception 'No tienes acceso a esta sucursal';
  end if;

  if not exists (
    select 1
    from public.branches br
    where br.id = p_branch_id
      and br.business_id = v_business_id
      and br.active = true
  ) then
    raise exception
      'La sucursal no existe, está inactiva o no pertenece a tu negocio';
  end if;


  -- ==========================================
  -- VALIDACIONES BÁSICAS
  -- ==========================================

  if p_number is null or trim(p_number) = '' then
    raise exception 'El número de compra es obligatorio';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra debe contener al menos un producto';
  end if;


  -- ==========================================
  -- VALIDAR PROVEEDOR
  -- ==========================================

  if p_supplier_id is not null then

    perform 1
    from public.suppliers
    where id = p_supplier_id
      and business_id = v_business_id;

    if not found then
      raise exception
        'El proveedor no existe o no pertenece a tu negocio';
    end if;

  end if;


  -- ==========================================
  -- CALCULAR TOTAL
  -- ==========================================

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop

    v_quantity :=
      (v_item->>'quantity')::integer;

    v_unit_cost :=
      (v_item->>'unit_cost')::numeric;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'La cantidad debe ser mayor que cero';
    end if;

    if v_unit_cost is null or v_unit_cost < 0 then
      raise exception 'El costo no puede ser negativo';
    end if;

    v_subtotal :=
      v_subtotal +
      (v_quantity * v_unit_cost);

  end loop;


  -- ==========================================
  -- VALIDAR CAJA DE LA MISMA SUCURSAL
  -- ==========================================

  if p_cash_session_id is not null then

    select
      status,
      branch_id
    into
      v_cash_status,
      v_cash_branch_id
    from public.cash_sessions
    where id = p_cash_session_id
      and business_id = v_business_id;

    if not found then
      raise exception
        'La sesión de caja no existe o no pertenece a tu negocio';
    end if;

    if v_cash_status <> 'open' then
      raise exception 'La sesión de caja ya está cerrada';
    end if;

    if v_cash_branch_id is distinct from p_branch_id then
      raise exception
        'La sesión de caja no pertenece a la sucursal seleccionada';
    end if;

  end if;


  -- ==========================================
  -- CREAR COMPRA
  -- ==========================================

  insert into public.purchases (
    number,
    supplier_id,
    subtotal,
    total,
    status,
    notes,
    user_id,
    business_id,
    branch_id
  )
  values (
    p_number,
    p_supplier_id,
    v_subtotal,
    v_subtotal,
    'completed',
    nullif(trim(p_notes), ''),
    auth.uid(),
    v_business_id,
    p_branch_id
  )
  returning id into v_purchase_id;


  -- ==========================================
  -- PROCESAR PRODUCTOS
  -- ==========================================

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop

    v_product_id :=
      (v_item->>'product_id')::uuid;

    v_quantity :=
      (v_item->>'quantity')::integer;

    v_unit_cost :=
      (v_item->>'unit_cost')::numeric;


    if v_product_id is null then
      raise exception 'Falta product_id';
    end if;


    -- El producto es global al negocio.
    select name
    into v_product_name
    from public.products
    where id = v_product_id
      and business_id = v_business_id;

    if not found then
      raise exception
        'El producto % no existe o no pertenece a tu negocio',
        v_product_id;
    end if;


    -- El inventario pertenece a la sucursal.
    select stock
    into v_stock_before
    from public.branch_inventory
    where business_id = v_business_id
      and branch_id = p_branch_id
      and product_id = v_product_id
    for update;

    if not found then
      raise exception
        'No existe inventario del producto "%" en la sucursal seleccionada',
        v_product_name;
    end if;


    v_stock_after :=
      v_stock_before + v_quantity;


    -- Guardamos la fotografía histórica de la compra.
    insert into public.purchase_items (
      purchase_id,
      product_id,
      name,
      quantity,
      unit_cost,
      subtotal,
      business_id
    )
    values (
      v_purchase_id,
      v_product_id,
      v_product_name,
      v_quantity,
      v_unit_cost,
      v_quantity * v_unit_cost,
      v_business_id
    );


    -- Actualizamos SOLO el inventario de esta sucursal.
    update public.branch_inventory
    set
      stock = v_stock_after,
      updated_at = now()
    where business_id = v_business_id
      and branch_id = p_branch_id
      and product_id = v_product_id;


    -- El costo continúa siendo global para el negocio.
    update public.products
    set
      cost_price = v_unit_cost,
      updated_at = now()
    where id = v_product_id
      and business_id = v_business_id;


    -- Movimiento de inventario de la sucursal.
    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reference_id,
      note,
      user_id,
      business_id,
      branch_id
    )
    values (
      v_product_id,
      'purchase',
      v_quantity,
      v_stock_before,
      v_stock_after,
      v_purchase_id,
      'Compra ' || p_number,
      auth.uid(),
      v_business_id,
      p_branch_id
    );

  end loop;


  -- ==========================================
  -- SALIDA DE EFECTIVO
  -- ==========================================

  if p_cash_session_id is not null then

    perform public.register_cash_movement(
      p_cash_session_id,
      'expense',
      v_subtotal,
      'Compra ' || p_number,
      v_purchase_id
    );

  end if;


  return v_purchase_id;

end;
$$;


--
-- Name: register_purchase_return(text, uuid, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_purchase_return(p_number text, p_purchase_id uuid, p_notes text, p_items jsonb, p_cash_session_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
  v_branch_id uuid;

  v_return_id uuid;
  v_purchase_number text;
  v_purchase_status text;

  v_item jsonb;

  v_purchase_item_id uuid;
  v_product_id uuid;
  v_product_name text;

  v_quantity integer;
  v_unit_cost numeric(12,2);
  v_subtotal numeric(12,2);

  v_original_quantity integer;
  v_already_returned integer;

  v_stock_before integer;
  v_stock_after integer;

  v_total numeric(12,2) := 0;

  v_cash_status text;
  v_cash_branch_id uuid;

begin

  -- ==========================================
  -- SEGURIDAD
  -- ==========================================

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.has_role(array['admin', 'manager']) then
    raise exception
      'No tienes permisos para registrar devoluciones de compras';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception
      'No se pudo determinar el negocio del usuario';
  end if;

  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite realizar operaciones de compras';
  end if;


  -- ==========================================
  -- 1. VALIDACIONES GENERALES
  -- ==========================================

  if p_number is null or trim(p_number) = '' then
    raise exception
      'El folio de devolución es obligatorio';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception
      'La devolución debe contener al menos un producto';
  end if;


  -- ==========================================
  -- 2. OBTENER COMPRA Y SU SUCURSAL
  -- ==========================================

  select
    number,
    status,
    branch_id
  into
    v_purchase_number,
    v_purchase_status,
    v_branch_id
  from public.purchases
  where id = p_purchase_id
    and business_id = v_business_id
  for update;

  if not found then
    raise exception
      'La compra no existe o no pertenece a tu negocio';
  end if;

  if v_purchase_status <> 'completed' then
    raise exception
      'No se pueden devolver productos de una compra cancelada';
  end if;

  if v_branch_id is null then
    raise exception
      'La compra no tiene una sucursal asociada';
  end if;

  if not public.has_branch_access(v_branch_id) then
    raise exception
      'No tienes acceso a la sucursal de esta compra';
  end if;

  if not exists (
    select 1
    from public.branches br
    where br.id = v_branch_id
      and br.business_id = v_business_id
      and br.active = true
  ) then
    raise exception
      'La sucursal de esta compra no existe o está inactiva';
  end if;


  -- ==========================================
  -- 3. VALIDAR CAJA
  -- ==========================================

  if p_cash_session_id is not null then

    select
      status,
      branch_id
    into
      v_cash_status,
      v_cash_branch_id
    from public.cash_sessions
    where id = p_cash_session_id
      and business_id = v_business_id;

    if not found then
      raise exception
        'La sesión de caja no existe o no pertenece a tu negocio';
    end if;

    if v_cash_status <> 'open' then
      raise exception
        'La sesión de caja no está abierta';
    end if;

    if v_cash_branch_id is distinct from v_branch_id then
      raise exception
        'La caja seleccionada no pertenece a la sucursal de esta compra';
    end if;

  end if;


  -- ==========================================
  -- 4. VALIDAR TODOS LOS ITEMS
  -- ==========================================

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop

    v_purchase_item_id :=
      (v_item->>'purchase_item_id')::uuid;

    v_quantity :=
      (v_item->>'quantity')::integer;

    if v_purchase_item_id is null then
      raise exception
        'Falta purchase_item_id';
    end if;

    if v_quantity is null or v_quantity <= 0 then
      raise exception
        'La cantidad a devolver debe ser mayor que cero';
    end if;


    select
      pi.product_id,
      pi.name,
      pi.quantity,
      pi.unit_cost
    into
      v_product_id,
      v_product_name,
      v_original_quantity,
      v_unit_cost
    from public.purchase_items pi
    where pi.id = v_purchase_item_id
      and pi.purchase_id = p_purchase_id
      and pi.business_id = v_business_id;

    if not found then
      raise exception
        'El producto seleccionado no pertenece a esta compra o negocio';
    end if;

    if v_product_id is null then
      raise exception
        'El producto "%" ya no existe',
        v_product_name;
    end if;


    select
      coalesce(sum(pri.quantity), 0)
    into v_already_returned
    from public.purchase_return_items pri
    join public.purchase_returns pr
      on pr.id = pri.purchase_return_id
     and pr.business_id = v_business_id
    where pri.purchase_item_id = v_purchase_item_id
      and pri.business_id = v_business_id
      and pr.purchase_id = p_purchase_id;


    if v_already_returned + v_quantity >
       v_original_quantity then

      raise exception
        'No puedes devolver % unidades de "%". Compradas: %, ya devueltas: %, disponibles para devolver: %',
        v_quantity,
        v_product_name,
        v_original_quantity,
        v_already_returned,
        v_original_quantity - v_already_returned;

    end if;


    -- Stock REAL de la sucursal de la compra

    select bi.stock
    into v_stock_before
    from public.branch_inventory bi
    where bi.business_id = v_business_id
      and bi.branch_id = v_branch_id
      and bi.product_id = v_product_id
    for update;

    if not found then
      raise exception
        'No existe inventario de "%" en la sucursal de esta compra',
        v_product_name;
    end if;

    if v_stock_before < v_quantity then
      raise exception
        'No hay stock suficiente de "%" en esta sucursal. Stock actual: %, quieres devolver: %',
        v_product_name,
        v_stock_before,
        v_quantity;
    end if;


    v_subtotal :=
      v_quantity * v_unit_cost;

    v_total :=
      v_total + v_subtotal;

  end loop;


  -- ==========================================
  -- 5. CREAR DEVOLUCIÓN
  -- ==========================================

  insert into public.purchase_returns (
    number,
    purchase_id,
    total,
    notes,
    user_id,
    business_id,
    branch_id
  )
  values (
    p_number,
    p_purchase_id,
    v_total,
    nullif(trim(p_notes), ''),
    auth.uid(),
    v_business_id,
    v_branch_id
  )
  returning id into v_return_id;


  -- ==========================================
  -- 6. PROCESAR ITEMS
  -- ==========================================

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop

    v_purchase_item_id :=
      (v_item->>'purchase_item_id')::uuid;

    v_quantity :=
      (v_item->>'quantity')::integer;


    select
      pi.product_id,
      pi.name,
      pi.unit_cost
    into
      v_product_id,
      v_product_name,
      v_unit_cost
    from public.purchase_items pi
    where pi.id = v_purchase_item_id
      and pi.purchase_id = p_purchase_id
      and pi.business_id = v_business_id;


    v_subtotal :=
      v_quantity * v_unit_cost;


    -- Bloquear inventario de ESTA sucursal

    select bi.stock
    into v_stock_before
    from public.branch_inventory bi
    where bi.business_id = v_business_id
      and bi.branch_id = v_branch_id
      and bi.product_id = v_product_id
    for update;


    v_stock_after :=
      v_stock_before - v_quantity;


    -- Restar únicamente en ESTA sucursal

    update public.branch_inventory
    set
      stock = v_stock_after,
      updated_at = now()
    where business_id = v_business_id
      and branch_id = v_branch_id
      and product_id = v_product_id;


    -- Guardar item devuelto

    insert into public.purchase_return_items (
      purchase_return_id,
      purchase_item_id,
      product_id,
      name,
      quantity,
      unit_cost,
      subtotal,
      business_id
    )
    values (
      v_return_id,
      v_purchase_item_id,
      v_product_id,
      v_product_name,
      v_quantity,
      v_unit_cost,
      v_subtotal,
      v_business_id
    );


    -- Movimiento de inventario de ESTA sucursal

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reference_id,
      note,
      user_id,
      business_id,
      branch_id
    )
    values (
      v_product_id,
      'return',
      -v_quantity,
      v_stock_before,
      v_stock_after,
      v_return_id,
      'Devolución ' || p_number ||
      ' de compra ' || v_purchase_number,
      auth.uid(),
      v_business_id,
      v_branch_id
    );

  end loop;


  -- ==========================================
  -- 7. REEMBOLSO EN CAJA
  -- ==========================================

  if p_cash_session_id is not null then

    perform public.register_cash_movement(
      p_cash_session_id,
      'income',
      v_total,
      'Devolución ' || p_number ||
      ' · Compra ' || v_purchase_number,
      v_return_id
    );

  end if;


  return v_return_id;

end;
$$;


--
-- Name: request_pos_pairing_challenge(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_pos_pairing_challenge(p_token_hash text, p_challenge_hash text, p_public_key text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
    v_attempts integer;
    v_device_id uuid;
    v_token public.pos_device_pairing_tokens%ROWTYPE;
    v_device public.pos_devices%ROWTYPE;
    v_challenge_id uuid;
BEGIN
    IF p_token_hash IS NULL
       OR p_token_hash !~ '^[0-9a-f]{64}$'
       OR p_challenge_hash IS NULL
       OR p_challenge_hash !~ '^[0-9a-f]{64}$'
       OR p_public_key IS NULL
       OR length(p_public_key) > 2048
       OR length(btrim(p_public_key)) = 0 THEN
        RETURN NULL;
    END IF;

    -- Lectura inicial: todavía no bloqueamos registros.
    SELECT device_id
    INTO v_device_id
    FROM public.pos_device_pairing_tokens
    WHERE token_hash = p_token_hash;

    -- Coordinar primero las operaciones del dispositivo.
    IF v_device_id IS NOT NULL THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(
                'pos-device-pairing:' || v_device_id::text,
                0
            )
        );
    END IF;

    -- Coordinar después los intentos del código.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_token_hash, 0)
    );

    SELECT COUNT(*)
    INTO v_attempts
    FROM public.pos_device_pairing_attempts
    WHERE pairing_token_hash = p_token_hash
      AND attempted_at > clock_timestamp() - INTERVAL '10 minutes';

    IF v_attempts >= 5 THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.pos_device_pairing_attempts (
        pairing_token_hash,
        successful
    )
    VALUES (p_token_hash, false);

    -- Volver a leer y bloquear el código.
    SELECT *
    INTO v_token
    FROM public.pos_device_pairing_tokens
    WHERE token_hash = p_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Confirmar que sigue siendo el dispositivo consultado.
    IF v_device_id IS DISTINCT FROM v_token.device_id THEN
        RETURN NULL;
    END IF;

    IF v_token.used_at IS NOT NULL
       OR v_token.expires_at <= clock_timestamp() THEN
        RETURN NULL;
    END IF;

    SELECT *
    INTO v_device
    FROM public.pos_devices
    WHERE id = v_token.device_id
      AND business_id = v_token.business_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_device.status <> 'active'
       OR v_device.linked_at IS NOT NULL THEN
        RETURN NULL;
    END IF;

    v_challenge_id :=
        public.create_pos_pairing_challenge(
            p_token_hash,
            p_challenge_hash,
            p_public_key
        );

    RETURN v_challenge_id;
END;
$_$;


--
-- Name: resolve_mobile_inventory_reconciliation(uuid, numeric, text, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_mobile_inventory_reconciliation(p_reconciliation_id uuid, p_expected_server_stock numeric, p_decision text, p_reason text, p_corrected_stock numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_request public.pos_mobile_inventory_reconciliations%ROWTYPE;
  v_current_stock numeric;
  v_target_stock numeric;
  v_delta numeric;
  v_sale_unit text;
  v_operation_id uuid;
  v_final_status text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesión de administrador requerida';
  END IF;

  IF p_reconciliation_id IS NULL
     OR p_expected_server_stock IS NULL
     OR p_expected_server_stock < 0
     OR p_expected_server_stock >= 1000000000
     OR p_expected_server_stock <> round(p_expected_server_stock, 3)
     OR p_decision IS NULL
     OR p_decision NOT IN (
       'reject',
       'keep_server',
       'accept_count',
       'corrected_count'
     )
     OR p_reason IS NULL
     OR length(btrim(p_reason)) < 10
     OR length(p_reason) > 1000
  THEN
    RAISE EXCEPTION 'Datos de resolución inválidos';
  END IF;

  IF p_decision = 'corrected_count' THEN
    IF p_corrected_stock IS NULL
       OR p_corrected_stock < 0
       OR p_corrected_stock >= 1000000000
       OR p_corrected_stock <> round(p_corrected_stock, 3)
    THEN
      RAISE EXCEPTION 'Existencia corregida inválida';
    END IF;
  ELSIF p_corrected_stock IS NOT NULL THEN
    RAISE EXCEPTION 'La decisión no admite existencia corregida';
  END IF;

  -- Bloquear la solicitud: evita dos resoluciones simultáneas.
  SELECT *
  INTO v_request
  FROM public.pos_mobile_inventory_reconciliations
  WHERE id = p_reconciliation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud inexistente';
  END IF;

  -- Verificar autorización con el usuario autenticado.
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.businesses b
      ON b.id = p.business_id
    WHERE p.id = v_user_id
      AND p.active = true
      AND p.role = 'admin'
      AND b.id = v_request.business_id
      AND b.active = true
  ) THEN
    RAISE EXCEPTION 'Administrador no autorizado';
  END IF;

  -- Aplicar los mismos controles operativos del POS web.
  IF NOT public.has_operational_subscription() THEN
    RAISE EXCEPTION 'La suscripción no permite operar inventario';
  END IF;

  IF NOT public.has_branch_access(v_request.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la conciliación';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'La solicitud ya tiene una resolución';
  END IF;

  -- Verificar pertenencia al mismo negocio y sucursal.
  IF NOT EXISTS (
    SELECT 1
    FROM public.pos_devices d
    JOIN public.branches b
      ON b.id = d.branch_id
     AND b.business_id = d.business_id
    WHERE d.id = v_request.device_id
      AND d.business_id = v_request.business_id
      AND d.branch_id = v_request.branch_id
      AND d.status = 'active'
      AND d.linked_at IS NOT NULL
      AND d.revoked_at IS NULL
      AND b.active = true
  ) THEN
    RAISE EXCEPTION 'Dispositivo o sucursal inconsistente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pos_mobile_product_links l
    WHERE l.device_id = v_request.device_id
      AND l.business_id = v_request.business_id
      AND l.local_product_id = v_request.local_product_id
      AND l.product_id = v_request.product_id
  ) THEN
    RAISE EXCEPTION 'Vinculación del producto inconsistente';
  END IF;

  SELECT sale_unit
  INTO v_sale_unit
  FROM public.products
  WHERE id = v_request.product_id
    AND business_id = v_request.business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto remoto inexistente';
  END IF;

  -- Bloquear inventario y comprobar concurrencia.
  SELECT stock
  INTO v_current_stock
  FROM public.branch_inventory
  WHERE business_id = v_request.business_id
    AND branch_id = v_request.branch_id
    AND product_id = v_request.product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventario remoto inexistente';
  END IF;

  IF v_current_stock IS DISTINCT FROM p_expected_server_stock THEN
    RAISE EXCEPTION
      'Las existencias cambiaron. Actualiza la revisión antes de decidir';
  END IF;

  v_final_status :=
    CASE WHEN p_decision = 'reject'
      THEN 'rejected'
      ELSE 'applied'
    END;

  v_target_stock :=
    CASE
      WHEN p_decision = 'accept_count'
        THEN v_request.requested_stock
      WHEN p_decision = 'corrected_count'
        THEN p_corrected_stock
      ELSE v_current_stock
    END;

  IF v_target_stock < 0
     OR v_target_stock >= 1000000000
     OR v_target_stock <> round(v_target_stock, 3)
  THEN
    RAISE EXCEPTION 'Existencia definitiva inválida';
  END IF;

  IF v_sale_unit = 'piece'
     AND (
       v_current_stock <> trunc(v_current_stock)
       OR v_target_stock <> trunc(v_target_stock)
     )
  THEN
    RAISE EXCEPTION 'Los productos por pieza requieren cantidades enteras';
  END IF;

  v_delta := v_target_stock - v_current_stock;

  -- Sin cambios de stock para rechazar o conservar el servidor.
  IF v_delta <> 0 THEN
    UPDATE public.branch_inventory
    SET stock = v_target_stock,
        updated_at = now()
    WHERE business_id = v_request.business_id
      AND branch_id = v_request.branch_id
      AND product_id = v_request.product_id;

    INSERT INTO public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reference_id,
      note,
      user_id,
      business_id,
      branch_id
    )
    VALUES (
      v_request.product_id,
      'adjustment',
      v_delta,
      v_current_stock,
      v_target_stock,
      v_request.id,
      'Conciliación móvil: ' || btrim(p_reason),
      v_user_id,
      v_request.business_id,
      v_request.branch_id
    )
    RETURNING id INTO v_operation_id;
  END IF;

  UPDATE public.pos_mobile_inventory_reconciliations
  SET status = v_final_status,
      reviewed_by = v_user_id,
      decision = CASE
        WHEN p_decision = 'reject' THEN NULL
        ELSE p_decision
      END,
      reason = btrim(p_reason),
      corrected_stock = CASE
        WHEN p_decision = 'corrected_count'
          THEN p_corrected_stock
        ELSE NULL
      END,
      server_stock_at_review = v_current_stock,
      reviewed_at = now(),
      applied_at = CASE
        WHEN v_final_status = 'applied' THEN now()
        ELSE NULL
      END
  WHERE id = v_request.id;

  RETURN pg_catalog.jsonb_build_object(
    'reconciliationId', v_request.id,
    'status', v_final_status,
    'decision', p_decision,
    'stockBefore', v_current_stock,
    'stockAfter', v_target_stock,
    'inventoryMovementId', v_operation_id
  );
END;
$$;


--
-- Name: resolve_pos_device_pairing_state(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_pos_device_pairing_state(p_challenge_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_device_id uuid;
  v_token public.pos_device_pairing_tokens%ROWTYPE;
  v_device public.pos_devices%ROWTYPE;
  v_challenge public.pos_device_pairing_challenges%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF p_challenge_id IS NULL THEN
    RETURN 'blocked';
  END IF;

  -- Localizar el dispositivo antes de adquirir bloqueos.
  SELECT t.device_id
  INTO v_device_id
  FROM public.pos_device_pairing_challenges c
  JOIN public.pos_device_pairing_tokens t
    ON t.id = c.pairing_token_id
  WHERE c.id = p_challenge_id;

  IF v_device_id IS NULL THEN
    RETURN 'blocked';
  END IF;

  -- Mismo bloqueo advisory que utiliza
  -- confirm_pos_device_pairing.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pos-device-pairing:' || v_device_id::text,
      0
    )
  );

  -- Conservar el orden de bloqueo:
  -- token, dispositivo, desafío.

  SELECT t.*
  INTO v_token
  FROM public.pos_device_pairing_tokens t
  JOIN public.pos_device_pairing_challenges c
    ON c.pairing_token_id = t.id
  WHERE c.id = p_challenge_id
  FOR UPDATE OF t;

  IF NOT FOUND
     OR v_token.device_id IS DISTINCT FROM v_device_id THEN
    RETURN 'blocked';
  END IF;

  SELECT *
  INTO v_device
  FROM public.pos_devices
  WHERE id = v_token.device_id
    AND business_id = v_token.business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'blocked';
  END IF;

  SELECT *
  INTO v_challenge
  FROM public.pos_device_pairing_challenges
  WHERE id = p_challenge_id
    AND pairing_token_id = v_token.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'blocked';
  END IF;

  v_now := pg_catalog.clock_timestamp();

  -- No autorizar estados revocados o inconsistentes.
  IF v_device.status <> 'active'
     OR v_device.revoked_at IS NOT NULL
     OR (
       (v_device.public_key IS NULL)
       <> (v_device.linked_at IS NULL)
     )
  THEN
    RETURN 'blocked';
  END IF;

  -- Ya vinculado: nunca liberar el intento.
  -- El backend deberá comprobar que la clave coincide
  -- y exigir una firma nueva para recuperar la identidad.
  IF v_device.linked_at IS NOT NULL THEN
    RETURN 'linked';
  END IF;

  -- No vinculado, pero token consumido: inconsistencia.
  IF v_token.used_at IS NOT NULL THEN
    RETURN 'blocked';
  END IF;

  -- El desafío todavía puede confirmarse.
  IF v_token.expires_at > v_now
     AND v_challenge.expires_at > v_now
     AND v_challenge.used_at IS NULL
  THEN
    RETURN 'pending';
  END IF;

  -- Confirmación imposible con este desafío.
  -- Esto NO autoriza por sí solo a borrar SecureStore.
  RETURN 'not_linked';
END;
$$;


--
-- Name: send_inventory_transfer(uuid, uuid, uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_inventory_transfer(p_transfer_id uuid, p_source_branch_id uuid, p_destination_branch_id uuid, p_items jsonb, p_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_business_id uuid;
  v_user_id uuid;
  v_transfer public.inventory_transfers%rowtype;
  v_inventory public.branch_inventory%rowtype;
  v_item record;
  v_product_name text;
  v_sale_unit text;
  v_note text;
  v_inserted integer;
begin
  v_user_id := auth.uid();
  v_business_id := public.current_business_id();
  v_note := nullif(btrim(p_note), '');

  if v_user_id is null or v_business_id is null then
    raise exception 'No hay un usuario y negocio activos';
  end if;

  if not coalesce(
    public.can_manage_inventory_transfers(),
    false
  ) then
    raise exception 'No tienes permiso para gestionar transferencias';
  end if;

  if p_transfer_id is null then
    raise exception 'Falta el identificador de la transferencia';
  end if;

  if p_source_branch_id is null
     or p_destination_branch_id is null
     or p_source_branch_id = p_destination_branch_id then
    raise exception 'Selecciona dos sucursales diferentes';
  end if;

  if not coalesce(
    public.has_branch_access(p_source_branch_id), false
  ) or not coalesce(
    public.has_branch_access(p_destination_branch_id), false
  ) then
    raise exception 'Necesitas acceso a ambas sucursales activas';
  end if;

  -- Validación explícita del negocio de ambas sucursales.
  if (
    select count(*)
    from public.branches b
    where b.id in (
      p_source_branch_id,
      p_destination_branch_id
    )
      and b.business_id = v_business_id
      and b.active = true
  ) <> 2 then
    raise exception 'Las sucursales deben pertenecer a tu negocio';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array' then
    raise exception 'La lista de productos debe ser un arreglo';
  end if;

  if jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 500 then
    raise exception 'Agrega entre 1 y 500 productos';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as e(item)
    where jsonb_typeof(e.item) <> 'object'
       or jsonb_typeof(e.item -> 'product_id')
          is distinct from 'string'
       or jsonb_typeof(e.item -> 'quantity')
          is distinct from 'number'
  ) then
    raise exception 'Cada producto necesita product_id y quantity numérica';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
      as i(product_id uuid, quantity numeric)
    where i.product_id is null
       or i.quantity is null
       or i.quantity <= 0
       or i.quantity::text in ('NaN', 'Infinity', '-Infinity')
  ) then
    raise exception 'Las cantidades deben ser números positivos';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
      as i(product_id uuid, quantity numeric)
    group by i.product_id
    having count(*) > 1
  ) then
    raise exception 'Un producto no puede aparecer dos veces';
  end if;

  -- El ID funciona como clave de idempotencia.
  -- Un reintento concurrente espera la primera transacción.
  insert into public.inventory_transfers (
    id,
    business_id,
    source_branch_id,
    destination_branch_id,
    note,
    sent_by,
    request_items
  )
  values (
    p_transfer_id,
    v_business_id,
    p_source_branch_id,
    p_destination_branch_id,
    v_note,
    v_user_id,
    p_items
  )
  on conflict (id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select t.*
    into v_transfer
    from public.inventory_transfers t
    where t.id = p_transfer_id
    for update;

    if v_transfer.business_id is distinct from v_business_id
       or v_transfer.sent_by is distinct from v_user_id
       or v_transfer.source_branch_id
          is distinct from p_source_branch_id
       or v_transfer.destination_branch_id
          is distinct from p_destination_branch_id
       or v_transfer.request_items is distinct from p_items
       or v_transfer.note is distinct from v_note then
      raise exception 'Este identificador ya fue usado para otra solicitud';
    end if;

    return v_transfer.id;
  end if;

  -- Orden estable de bloqueo para reducir interbloqueos.
  for v_item in
    select i.product_id, i.quantity
    from jsonb_to_recordset(p_items)
      as i(product_id uuid, quantity numeric)
    order by i.product_id
  loop
    select p.name, p.sale_unit
    into v_product_name, v_sale_unit
    from public.products p
    where p.id = v_item.product_id
      and p.business_id = v_business_id
    for share;

    if not found then
      raise exception 'Producto inexistente o ajeno al negocio: %',
        v_item.product_id;
    end if;

    if v_sale_unit = 'piece'
       and v_item.quantity <> trunc(v_item.quantity) then
      raise exception 'El producto "%" se transfiere en piezas enteras',
        v_product_name;
    end if;

    select bi.*
    into v_inventory
    from public.branch_inventory bi
    where bi.branch_id = p_source_branch_id
      and bi.product_id = v_item.product_id
    for update;

    if not found then
      raise exception 'No hay inventario de "%" en la sucursal origen',
        v_product_name;
    end if;

    if v_inventory.business_id <> v_business_id then
      raise exception 'El inventario no pertenece a tu negocio';
    end if;

    if v_inventory.stock < v_item.quantity then
      raise exception 'Stock insuficiente para "%". Disponible: %, solicitado: %',
        v_product_name,
        v_inventory.stock,
        v_item.quantity;
    end if;

    insert into public.inventory_transfer_items (
      transfer_id,
      product_id,
      product_name,
      sale_unit,
      quantity
    )
    values (
      p_transfer_id,
      v_item.product_id,
      v_product_name,
      v_sale_unit,
      v_item.quantity
    );

    update public.branch_inventory
    set stock = stock - v_item.quantity,
        updated_at = now()
    where id = v_inventory.id;

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reference_id,
      note,
      user_id,
      business_id,
      branch_id
    )
    values (
      v_item.product_id,
      'transfer_out',
      v_item.quantity,
      v_inventory.stock,
      v_inventory.stock - v_item.quantity,
      p_transfer_id,
      'Envío de transferencia entre sucursales',
      v_user_id,
      v_business_id,
      p_source_branch_id
    );
  end loop;

  return p_transfer_id;
end;
$$;


--
-- Name: set_business_active(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_business_active(target_business_id uuid, new_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Acceso denegado';
  end if;

  if not exists (
    select 1
    from public.businesses
    where id = target_business_id
  ) then
    raise exception 'Negocio no encontrado';
  end if;

  /*
    Obtenemos el tenant al que pertenece
    el usuario que está ejecutando la acción.
  */
  select p.business_id
  into caller_business_id
  from public.profiles p
  where p.id = auth.uid();

  /*
    Mientras el acceso al panel SaaS dependa
    del tenant del superadmin, impedimos que
    suspenda su propio negocio.
  */
  if new_active = false
     and target_business_id = caller_business_id then
    raise exception
      'No puedes suspender tu propio negocio desde el panel SaaS';
  end if;

  update public.businesses
  set
    active = new_active,
    updated_at = now()
  where id = target_business_id;
end;
$$;


--
-- Name: set_business_payment_settings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_business_payment_settings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: set_business_plan(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_business_plan(target_business_id uuid, target_plan_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_plan_exists boolean;
  v_business_exists boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  if not public.is_platform_admin() then
    raise exception 'No tienes permisos para cambiar planes';
  end if;

  -- Verificar que el negocio exista.
  select exists (
    select 1
    from public.businesses
    where id = target_business_id
  )
  into v_business_exists;

  if not v_business_exists then
    raise exception 'El negocio no existe';
  end if;

  -- El plan debe existir y estar activo.
  select exists (
    select 1
    from public.plans
    where id = target_plan_id
      and active = true
  )
  into v_plan_exists;

  if not v_plan_exists then
    raise exception 'El plan no existe o está inactivo';
  end if;

  -- Actualizar la suscripción existente.
  update public.subscriptions
  set
    plan_id = target_plan_id,
    updated_at = now()
  where business_id = target_business_id;

  if not found then
    raise exception 'El negocio no tiene una suscripción';
  end if;
end;
$$;


--
-- Name: set_business_timezone(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_business_timezone(target_business_id uuid, new_timezone text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Acceso denegado';
  end if;

  if not exists (
    select 1
    from public.businesses
    where id = target_business_id
  ) then
    raise exception 'Negocio no encontrado';
  end if;

  if not exists (
    select 1
    from pg_timezone_names
    where name = new_timezone
  ) then
    raise exception 'Zona horaria inválida';
  end if;

  update public.businesses
  set
    timezone = new_timezone,
    updated_at = now()
  where id = target_business_id;
end;
$$;


--
-- Name: set_employee_active(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_employee_active(p_employee_id uuid, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.has_role(array['admin']) then
    raise exception 'Solo un administrador puede activar o desactivar empleados';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  -- La suscripción debe permitir operaciones
  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite administrar usuarios';
  end if;

  if p_employee_id is null then
    raise exception 'Empleado no válido';
  end if;

  if p_active is null then
    raise exception 'Estado no válido';
  end if;

  if p_employee_id = auth.uid()
     and p_active = false then
    raise exception 'No puedes desactivar tu propia cuenta';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_employee_id
      and business_id = v_business_id
  ) then
    raise exception 'Empleado no encontrado o no pertenece a tu negocio';
  end if;

  update public.profiles
  set
    active = p_active,
    updated_at = now()
  where id = p_employee_id
    and business_id = v_business_id;
end;
$$;


--
-- Name: set_employee_branches(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_employee_branches(p_employee_id uuid, p_branch_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
  v_branch_ids uuid[];
  v_requested_count integer;
  v_valid_count integer;
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.has_role(array['admin']) then
    raise exception 'No tienes permisos para administrar sucursales de empleados';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  -- El empleado debe pertenecer al negocio actual.
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_employee_id
      and p.business_id = v_business_id
  ) then
    raise exception 'El empleado no pertenece a tu negocio';
  end if;

  -- Quitar duplicados del arreglo recibido.
  select coalesce(
    array_agg(distinct branch_id),
    array[]::uuid[]
  )
  into v_branch_ids
  from unnest(
    coalesce(p_branch_ids, array[]::uuid[])
  ) as branch_id;

  v_requested_count :=
    coalesce(array_length(v_branch_ids, 1), 0);

  if v_requested_count = 0 then
    raise exception 'El empleado debe tener al menos una sucursal asignada';
  end if;

  -- Todas deben pertenecer al negocio y estar activas.
  select count(*)
  into v_valid_count
  from public.branches b
  where b.id = any(v_branch_ids)
    and b.business_id = v_business_id
    and b.active = true;

  if v_valid_count <> v_requested_count then
    raise exception 'Una o más sucursales no son válidas o están inactivas';
  end if;

  -- Reemplazar asignaciones.
  delete from public.profile_branches
  where profile_id = p_employee_id
    and business_id = v_business_id;

  insert into public.profile_branches (
    profile_id,
    branch_id,
    business_id
  )
  select
    p_employee_id,
    branch_id,
    v_business_id
  from unnest(v_branch_ids) as branch_id;
end;
$$;


--
-- Name: set_inventory_movement_business_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_inventory_movement_business_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_product_business_id uuid;
  v_user_business_id uuid;
BEGIN

  -- El negocio del producto siempre se obtiene
  -- directamente de la base de datos.
  SELECT p.business_id
  INTO v_product_business_id
  FROM public.products p
  WHERE p.id = NEW.product_id;

  IF v_product_business_id IS NULL THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  IF auth.role() = 'service_role' THEN

    -- La sincronización administrativa debe proporcionar
    -- el mismo negocio al que pertenece el producto.
    IF NEW.business_id IS DISTINCT FROM v_product_business_id THEN
      RAISE EXCEPTION
        'El negocio del movimiento no coincide con el producto';
    END IF;

    -- Comprobar que la sucursal corresponde
    -- al mismo negocio.
    IF NEW.branch_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = NEW.branch_id
        AND b.business_id = v_product_business_id
    ) THEN
      RAISE EXCEPTION
        'La sucursal del movimiento no pertenece al negocio';
    END IF;

  ELSE

    -- Conservar la validación original para el POS web.
    v_user_business_id := public.current_business_id();

    IF v_user_business_id IS NULL THEN
      RAISE EXCEPTION
        'No se pudo determinar el negocio del usuario';
    END IF;

    IF v_product_business_id <> v_user_business_id THEN
      RAISE EXCEPTION
        'El producto no pertenece a tu negocio';
    END IF;

  END IF;

  NEW.business_id := v_product_business_id;

  RETURN NEW;
END;
$$;


--
-- Name: set_product_business_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_product_business_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_business_id uuid;
  v_max_products integer;
  v_current_products bigint;
BEGIN

  IF auth.role() = 'service_role' THEN

    -- Las operaciones administrativas autorizadas deben
    -- indicar explícitamente el negocio.
    v_business_id := NEW.business_id;

    IF v_business_id IS NULL THEN
      RAISE EXCEPTION 'La operación administrativa requiere business_id';
    END IF;

  ELSE

    -- Comportamiento original para usuarios del POS web.
    v_business_id := public.current_business_id();

    IF v_business_id IS NULL THEN
      RAISE EXCEPTION 'No hay un negocio activo disponible';
    END IF;

  END IF;

  -- Comprobar existencia y estado del negocio.
  IF NOT EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE b.id = v_business_id
      AND b.active = true
  ) THEN
    RAISE EXCEPTION 'El negocio no está activo o no existe';
  END IF;

  -- Aplicar el límite de productos del plan.
  SELECT p.max_products
  INTO v_max_products
  FROM public.subscriptions s
  JOIN public.plans p
    ON p.id = s.plan_id
  WHERE s.business_id = v_business_id
    AND s.status IN ('active', 'trialing', 'past_due')
    AND p.active = true;

  IF v_max_products IS NULL THEN
    RAISE EXCEPTION 'El negocio no tiene una suscripción válida';
  END IF;

  SELECT COUNT(*)
  INTO v_current_products
  FROM public.products
  WHERE business_id = v_business_id;

  IF v_current_products >= v_max_products THEN
    RAISE EXCEPTION
      'Tu plan permite un máximo de % productos',
      v_max_products;
  END IF;

  NEW.business_id := v_business_id;

  RETURN NEW;
END;
$$;


--
-- Name: set_supplier_business_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_supplier_business_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
begin

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  -- Ignoramos cualquier business_id enviado por el cliente.
  -- La fuente de verdad es el usuario autenticado.
  new.business_id := v_business_id;

  return new;

end;
$$;


--
-- Name: sync_inventory_movement(uuid, uuid, uuid, text, numeric, numeric, numeric, numeric, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_inventory_movement(p_movement_id uuid, p_product_id uuid, p_branch_id uuid, p_type text, p_quantity numeric, p_delta numeric, p_previous_stock numeric, p_resulting_stock numeric, p_reason text DEFAULT NULL::text, p_created_at timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$declare
    v_user_id uuid;
    v_business_id uuid;
    v_current_stock numeric;
    v_new_stock numeric;
    v_server_movement_type text;
    v_existing_movement record;
    v_inventory_movement_id uuid;
begin
    -- Usuario autenticado
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Usuario no autenticado';
    end if;

    -- Negocio del usuario
    select business_id
    into v_business_id
    from public.profiles
    where id = v_user_id
      and active = true;

    if v_business_id is null then
        raise exception 'El usuario no pertenece a un negocio';
    end if;

    -- Validaciones básicas
    if p_movement_id is null then
        raise exception 'movement_id es obligatorio';
    end if;

    if p_product_id is null then
        raise exception 'product_id es obligatorio';
    end if;

    if p_branch_id is null then
        raise exception 'branch_id es obligatorio';
    end if;

    if p_type is null or p_type not in ('IN', 'OUT', 'CORRECTION') then
        raise exception 'Tipo de movimiento no válido: %', p_type;
    end if;

    if p_quantity < 0 then
        raise exception 'La cantidad no puede ser negativa';
    end if;

    if p_type <> 'CORRECTION' and p_quantity <= 0 then
        raise exception 'La cantidad debe ser mayor que cero';
    end if;

    -- Todos los valores numéricos son obligatorios.
if p_quantity is null
   or p_delta is null
   or p_previous_stock is null
   or p_resulting_stock is null then
    raise exception 'Faltan valores de inventario';
end if;

-- Evitar valores numéricos no finitos.
if p_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
   or p_delta in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
   or p_previous_stock in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
   or p_resulting_stock in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then
    raise exception 'Los valores de inventario deben ser finitos';
end if;

if p_previous_stock < 0 or p_resulting_stock < 0 then
    raise exception 'El stock local no puede ser negativo';
end if;

-- El delta debe coincidir con el cambio calculado en Android.
if p_delta <> p_resulting_stock - p_previous_stock then
    raise exception 'El delta no coincide con el cambio de inventario';
end if;

-- Entradas.
if p_type = 'IN' and p_delta <> p_quantity then
    raise exception 'La entrada debe aumentar el stock en la cantidad indicada';
end if;

-- Salidas.
if p_type = 'OUT' and p_delta <> -p_quantity then
    raise exception 'La salida debe disminuir el stock en la cantidad indicada';
end if;

-- Correcciones: quantity representa el nuevo stock local.
if p_type = 'CORRECTION'
   and p_resulting_stock <> p_quantity then
    raise exception 'La corrección debe indicar el nuevo stock local';
end if;

    -- Traducir el vocabulario interno de Android
    -- al vocabulario utilizado por el SaaS.
    v_server_movement_type :=
        case p_type
            when 'IN' then 'stock_in'
            when 'OUT' then 'adjustment'
            when 'CORRECTION' then 'adjustment'
        end;

    -- Validar que la sucursal pertenece al negocio.
    if not exists (
        select 1
        from public.branches
        where id = p_branch_id
          and business_id = v_business_id
    ) then
        raise exception 'La sucursal no pertenece al negocio';
    end if;

    -- Validar que el usuario tiene acceso a la sucursal.
    if not exists (
        select 1
        from public.profile_branches
        where profile_id = v_user_id
          and branch_id = p_branch_id
    ) then
        raise exception 'El usuario no tiene acceso a la sucursal';
    end if;

    -- Validar que el producto pertenece al negocio.
    if not exists (
        select 1
        from public.products
        where id = p_product_id
          and business_id = v_business_id
    ) then
        raise exception 'El producto no pertenece al negocio';
    end if;

    -- Idempotencia:
    -- si este movimiento Android ya fue aplicado,
    -- no volvemos a modificar el inventario.
    select *
    into v_existing_movement
    from public.inventory_movements
    where reference_id = p_movement_id
    limit 1;

    if found then
        if v_existing_movement.business_id <> v_business_id then
            raise exception 'El movimiento pertenece a otro negocio';
        end if;

        if v_existing_movement.branch_id <> p_branch_id then
            raise exception 'El movimiento pertenece a otra sucursal';
        end if;

        if v_existing_movement.product_id <> p_product_id then
            raise exception 'El movimiento pertenece a otro producto';
        end if;

        return jsonb_build_object(
            'success', true,
            'already_synced', true,
            'movement_id', v_existing_movement.id,
            'movement_type', v_existing_movement.movement_type,
            'new_server_stock', v_existing_movement.stock_after
        );
    end if;

    -- Bloquear la fila de inventario durante la operación.
    select stock
    into v_current_stock
    from public.branch_inventory
    where business_id = v_business_id
      and branch_id = p_branch_id
      and product_id = p_product_id
    for update;

    if not found then
        raise exception 'No existe inventario para este producto en la sucursal';
    end if;

    -- Segunda comprobación después de bloquear el inventario.
    -- Evita aplicar dos veces un mismo movimiento concurrente.
    select *
    into v_existing_movement
    from public.inventory_movements
    where reference_id = p_movement_id
    limit 1;

    if found then
        if v_existing_movement.business_id <> v_business_id
           or v_existing_movement.branch_id <> p_branch_id
           or v_existing_movement.product_id <> p_product_id then
            raise exception
                'El movimiento existente no corresponde al contexto actual';
        end if;

        return jsonb_build_object(
            'success', true,
            'already_synced', true,
            'movement_id', v_existing_movement.id,
            'movement_type', v_existing_movement.movement_type,
            'new_server_stock', v_existing_movement.stock_after
        );
    end if;

    -- Aplicamos DELTA, no el stock absoluto calculado por Android.
    -- Esto evita pisar cambios que hayan ocurrido en el servidor.
    v_new_stock := v_current_stock + p_delta;

    if v_new_stock < 0 then
        raise exception
            'El movimiento produciría inventario negativo. Stock actual: %, delta: %',
            v_current_stock,
            p_delta;
    end if;

    -- Actualizar inventario central.
    update public.branch_inventory
    set
        stock = v_new_stock,
        updated_at = now()
    where business_id = v_business_id
      and branch_id = p_branch_id
      and product_id = p_product_id;

    -- Registrar movimiento utilizando los valores permitidos
    -- por inventory_movements_movement_type_check.
    insert into public.inventory_movements (
        product_id,
        movement_type,
        quantity,
        stock_before,
        stock_after,
        reference_id,
        note,
        created_at,
        user_id,
        business_id,
        branch_id
    )
    values (
        p_product_id,
        v_server_movement_type,
        p_quantity,
        v_current_stock,
        v_new_stock,
        p_movement_id,
        p_reason,
        p_created_at,
        v_user_id,
        v_business_id,
        p_branch_id
    )
    returning id
    into v_inventory_movement_id;

    return jsonb_build_object(
        'success', true,
        'already_synced', false,
        'movement_id', v_inventory_movement_id,
        'movement_type', v_server_movement_type,
        'android_previous_stock', p_previous_stock,
        'android_resulting_stock', p_resulting_stock,
        'previous_server_stock', v_current_stock,
        'delta', p_delta,
        'new_server_stock', v_new_stock
    );
end;$$;


--
-- Name: sync_mobile_cash_close(uuid, text, numeric, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_mobile_cash_close(p_device_id uuid, p_local_session_id text, p_closing_amount numeric, p_closed_at timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_device public.pos_devices%ROWTYPE;
  v_session public.cash_sessions%ROWTYPE;
  v_expected numeric;
BEGIN
  SELECT * INTO v_device
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

  IF p_local_session_id IS NULL
    OR length(p_local_session_id) NOT BETWEEN 1 AND 128
    OR p_closing_amount IS NULL OR p_closing_amount < 0
    OR p_closed_at IS NULL
  THEN
    RAISE EXCEPTION 'Cierre de caja inválido';
  END IF;

  SELECT cs.* INTO v_session
  FROM public.cash_sessions cs
  JOIN public.pos_mobile_cash_session_links l
    ON l.cash_session_id = cs.id
  WHERE l.device_id = p_device_id
    AND l.local_session_id = p_local_session_id
    AND l.business_id = v_device.business_id
    AND l.branch_id = v_device.branch_id
    AND cs.business_id = v_device.business_id
    AND cs.branch_id = v_device.branch_id
  FOR UPDATE OF cs;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión de caja no sincronizada';
  END IF;

  IF v_session.status = 'closed' THEN
    -- Una caja histórica se importa cerrada pero
    -- todavía no tiene importes finales.
    IF v_session.closing_amount IS NULL
       AND v_session.expected_amount IS NULL
       AND v_session.difference IS NULL
    THEN
      IF v_session.closed_at IS DISTINCT FROM p_closed_at THEN
        RAISE EXCEPTION
          'La fecha del cierre histórico no coincide';
      END IF;

      -- Continuar para calcular el corte después
      -- de importar las ventas y movimientos.
    ELSE
      IF v_session.closing_amount IS DISTINCT FROM p_closing_amount
         OR v_session.closed_at IS DISTINCT FROM p_closed_at
      THEN
        RAISE EXCEPTION
          'La caja ya fue cerrada con datos diferentes';
      END IF;

      RETURN v_session.id;
    END IF;
  END IF;

  IF p_closed_at < v_session.opened_at THEN
    RAISE EXCEPTION 'Fecha de cierre inválida';
  END IF;

  -- Calcular efectivo esperado con ventas y movimientos.
  SELECT
    v_session.opening_amount
    + COALESCE((
        SELECT sum(
          CASE
            WHEN cm.movement_type = 'income'
            THEN cm.amount
            ELSE -cm.amount
          END
        )
        FROM public.cash_movements cm
        WHERE cm.cash_session_id = v_session.id
      ), 0)
    + COALESCE((
        SELECT sum(s.total)
        FROM public.sales s
        WHERE s.cash_session_id = v_session.id
          AND s.payment_method = 'cash'
      ), 0)
  INTO v_expected;

  UPDATE public.cash_sessions
  SET status = 'closed',
      closed_at = p_closed_at,
      closing_amount = p_closing_amount,
      expected_amount = v_expected,
      difference = p_closing_amount - v_expected
  WHERE id = v_session.id;

  RETURN v_session.id;
END;
$$;


--
-- Name: sync_mobile_cash_movement(uuid, text, text, text, numeric, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_mobile_cash_movement(p_device_id uuid, p_local_movement_id text, p_local_session_id text, p_movement_type text, p_amount numeric, p_concept text, p_created_at timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_device public.pos_devices%ROWTYPE;
  v_session public.cash_sessions%ROWTYPE;
  v_movement_id uuid;
BEGIN
  SELECT * INTO v_device
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

  IF p_local_movement_id IS NULL
    OR length(p_local_movement_id) NOT BETWEEN 1 AND 128
    OR p_local_session_id IS NULL
    OR length(p_local_session_id) NOT BETWEEN 1 AND 128
    OR p_movement_type NOT IN ('income', 'expense')
    OR p_amount IS NULL OR p_amount <= 0
    OR nullif(trim(p_concept), '') IS NULL
    OR p_created_at IS NULL
  THEN
    RAISE EXCEPTION 'Movimiento de caja inválido';
  END IF;

  SELECT server_record_id INTO v_movement_id
  FROM public.pos_mobile_sync_operations
  WHERE device_id = p_device_id
    AND local_operation_id = 'cash_movement:' || p_local_movement_id
    AND operation_type = 'cash_movement'
    AND status = 'completed';

  IF v_movement_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.cash_movements cm
      JOIN public.pos_mobile_cash_session_links l
        ON l.cash_session_id = cm.cash_session_id
      WHERE cm.id = v_movement_id
        AND l.device_id = p_device_id
        AND l.local_session_id = p_local_session_id
        AND l.business_id = v_device.business_id
        AND l.branch_id = v_device.branch_id
        AND cm.business_id = v_device.business_id
        AND cm.branch_id = v_device.branch_id
        AND cm.movement_type = p_movement_type
        AND cm.amount = p_amount
        AND cm.concept = trim(p_concept)
        AND cm.created_at = p_created_at
    ) THEN
      RAISE EXCEPTION
        'El movimiento ya sincronizado tiene datos diferentes';
    END IF;

    RETURN v_movement_id;
  END IF;

  SELECT cs.* INTO v_session
  FROM public.cash_sessions cs
  JOIN public.pos_mobile_cash_session_links l
    ON l.cash_session_id = cs.id
  WHERE l.device_id = p_device_id
    AND l.local_session_id = p_local_session_id
    AND l.business_id = v_device.business_id
    AND l.branch_id = v_device.branch_id
    AND cs.business_id = v_device.business_id
    AND cs.branch_id = v_device.branch_id
  FOR UPDATE OF cs;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión de caja no sincronizada';
  END IF;

  -- Permitir importar un movimiento histórico
  -- cuando pertenece al intervalo de esta sesión.
  IF p_created_at < v_session.opened_at
    OR (
      v_session.closed_at IS NOT NULL
      AND p_created_at > v_session.closed_at
    )
  THEN
    RAISE EXCEPTION 'Movimiento fuera de la sesión';
  END IF;

  INSERT INTO public.cash_movements (
    cash_session_id, movement_type, amount,
    concept, created_at, business_id, branch_id
  )
  VALUES (
    v_session.id, p_movement_type, p_amount,
    trim(p_concept), p_created_at,
    v_device.business_id, v_device.branch_id
  )
  RETURNING id INTO v_movement_id;

  INSERT INTO public.pos_mobile_sync_operations (
    device_id, business_id, branch_id,
    local_operation_id, operation_type,
    status, server_record_id, completed_at
  )
  VALUES (
    p_device_id, v_device.business_id,
    v_device.branch_id,
    'cash_movement:' || p_local_movement_id,
    'cash_movement', 'completed',
    v_movement_id, pg_catalog.clock_timestamp()
  );

  RETURN v_movement_id;
END;
$$;


--
-- Name: sync_mobile_cash_open(uuid, text, numeric, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_mobile_cash_open(p_device_id uuid, p_local_session_id text, p_opening_amount numeric, p_opened_at timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_device public.pos_devices%ROWTYPE;
  v_session_id uuid;
BEGIN
  SELECT * INTO v_device
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
    SELECT 1 FROM public.branches
    WHERE id = v_device.branch_id
      AND business_id = v_device.business_id
      AND active = true
  ) THEN
    RAISE EXCEPTION 'Sucursal no disponible';
  END IF;

  IF p_local_session_id IS NULL
    OR length(p_local_session_id) NOT BETWEEN 1 AND 128
    OR p_opening_amount IS NULL
    OR p_opening_amount < 0
    OR p_opened_at IS NULL
  THEN
    RAISE EXCEPTION 'Apertura de caja inválida';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'mobile-cash-branch:' || v_device.branch_id::text,
      0
    )
  );

  SELECT cash_session_id INTO v_session_id
  FROM public.pos_mobile_cash_session_links
  WHERE device_id = p_device_id
    AND local_session_id = p_local_session_id
    AND business_id = v_device.business_id
    AND branch_id = v_device.branch_id;

  IF v_session_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.cash_sessions cs
      WHERE cs.id = v_session_id
        AND cs.business_id = v_device.business_id
        AND cs.branch_id = v_device.branch_id
        AND cs.opening_amount = p_opening_amount
        AND cs.opened_at = p_opened_at
    ) THEN
      RAISE EXCEPTION
        'La apertura ya sincronizada tiene datos diferentes';
    END IF;

    RETURN v_session_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cash_sessions
    WHERE business_id = v_device.business_id
      AND branch_id = v_device.branch_id
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION
      'Ya existe una caja abierta en la sucursal';
  END IF;

  INSERT INTO public.cash_sessions (
    business_id, branch_id, opened_at,
    opening_amount, status
  )
  VALUES (
    v_device.business_id, v_device.branch_id,
    p_opened_at, p_opening_amount, 'open'
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.pos_mobile_cash_session_links (
    device_id, local_session_id, business_id,
    branch_id, cash_session_id
  )
  VALUES (
    p_device_id, p_local_session_id,
    v_device.business_id, v_device.branch_id,
    v_session_id
  );

  RETURN v_session_id;
END;
$$;


--
-- Name: sync_mobile_cash_open_historical(uuid, text, numeric, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: sync_mobile_product(uuid, text, text, text, numeric, numeric, numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_mobile_product(p_device_id uuid, p_local_product_id text, p_name text, p_barcode text, p_cost_price numeric, p_sale_price numeric, p_stock numeric, p_minimum_stock numeric, p_sale_unit text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_device public.pos_devices%ROWTYPE;
  v_product_id uuid;
BEGIN
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

  IF p_local_product_id IS NULL
     OR length(p_local_product_id) NOT BETWEEN 1 AND 128
     OR nullif(trim(p_name), '') IS NULL
     OR p_cost_price < 0
     OR p_sale_price < 0
     OR p_stock < 0
     OR p_minimum_stock < 0
     OR p_sale_unit NOT IN ('piece', 'kg')
  THEN
    RAISE EXCEPTION 'Producto móvil inválido';
  END IF;

  SELECT product_id
  INTO v_product_id
  FROM public.pos_mobile_product_links
  WHERE device_id = p_device_id
    AND local_product_id = p_local_product_id
    AND business_id = v_device.business_id;

  IF v_product_id IS NOT NULL THEN
    RETURN v_product_id;
  END IF;



  -- Vincular un producto web existente únicamente
  -- si el inventario inicial es exactamente compatible.
  IF nullif(btrim(p_barcode), '') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.products existing
       WHERE existing.business_id = v_device.business_id
         AND existing.barcode = btrim(p_barcode)
     )
  THEN
    DECLARE
      v_existing_product_id uuid;
      v_existing_unit text;
      v_existing_stock numeric;
      v_matches integer;
    BEGIN
      SELECT count(*)
      INTO v_matches
      FROM public.products existing
      WHERE existing.business_id = v_device.business_id
        AND existing.barcode = btrim(p_barcode);

      IF v_matches <> 1 THEN
        RAISE EXCEPTION
          'Código de barras ambiguo en el POS web';
      END IF;

      SELECT existing.id, existing.sale_unit
      INTO v_existing_product_id, v_existing_unit
      FROM public.products existing
      WHERE existing.business_id = v_device.business_id
        AND existing.barcode = btrim(p_barcode)
      FOR UPDATE;

      IF v_existing_unit IS DISTINCT FROM p_sale_unit THEN
        RAISE EXCEPTION
          'La unidad del producto difiere entre Android y web';
      END IF;

      SELECT inventory.stock
      INTO v_existing_stock
      FROM public.branch_inventory inventory
      WHERE inventory.business_id = v_device.business_id
        AND inventory.branch_id = v_device.branch_id
        AND inventory.product_id = v_existing_product_id
      FOR UPDATE;

      IF NOT FOUND
         OR v_existing_stock IS DISTINCT FROM p_stock
      THEN
        RAISE EXCEPTION
          'Inventario inicial diferente; se requiere conciliación';
      END IF;

      INSERT INTO public.pos_mobile_product_links (
        device_id,
        local_product_id,
        business_id,
        product_id
      )
      VALUES (
        p_device_id,
        p_local_product_id,
        v_device.business_id,
        v_existing_product_id
      );

      RETURN v_existing_product_id;
    END;
  END IF;

  INSERT INTO public.products (
    business_id,
    name,
    barcode,
    cost_price,
    sale_price,
    sale_unit
  )
  VALUES (
    v_device.business_id,
    trim(p_name),
    nullif(trim(p_barcode), ''),
    p_cost_price,
    p_sale_price,
    p_sale_unit
  )
  RETURNING id INTO v_product_id;

  INSERT INTO public.branch_inventory (
    business_id,
    branch_id,
    product_id,
    stock,
    minimum_stock
  )
  VALUES (
    v_device.business_id,
    v_device.branch_id,
    v_product_id,
    p_stock,
    p_minimum_stock
  );

  INSERT INTO public.pos_mobile_product_links (
    device_id,
    local_product_id,
    business_id,
    product_id
  )
  VALUES (
    p_device_id,
    p_local_product_id,
    v_device.business_id,
    v_product_id
  );

  RETURN v_product_id;
END;
$$;


--
-- Name: sync_mobile_product_change(uuid, text, text, numeric, jsonb, numeric, text, text, numeric, numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_mobile_product_change(p_device_id uuid, p_local_change_id text, p_local_product_id text, p_previous_stock numeric, p_previous_data jsonb, p_new_stock numeric, p_name text, p_barcode text, p_cost_price numeric, p_sale_price numeric, p_minimum_stock numeric, p_sale_unit text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_device public.pos_devices%ROWTYPE;
  v_product_id uuid;
  v_product public.products%ROWTYPE;
  v_existing_operation public.pos_mobile_sync_operations%ROWTYPE;
  v_stock numeric;
  v_payload jsonb;
BEGIN
  IF p_device_id IS NULL
    OR nullif(btrim(p_local_change_id), '') IS NULL
    OR length(p_local_change_id) > 128
    OR nullif(btrim(p_local_product_id), '') IS NULL
    OR length(p_local_product_id) > 128
    OR nullif(btrim(p_name), '') IS NULL
    OR p_previous_stock IS NULL
    OR p_previous_stock < 0
    OR p_previous_data IS NULL
    OR pg_catalog.jsonb_typeof(p_previous_data) <> 'object'
    OR p_new_stock IS NULL
    OR p_new_stock < 0
    OR p_cost_price IS NULL
    OR p_cost_price < 0
    OR p_sale_price IS NULL
    OR p_sale_price < 0
    OR p_minimum_stock IS NULL
    OR p_minimum_stock < 0
    OR p_sale_unit NOT IN ('piece', 'kg')
  THEN
    RAISE EXCEPTION 'Cambio de producto inválido';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'local_product_id', p_local_product_id,
    'previous_stock', p_previous_stock,
    'previous_data', p_previous_data,
    'new_stock', p_new_stock,
    'name', p_name,
    'barcode', p_barcode,
    'cost_price', p_cost_price,
    'sale_price', p_sale_price,
    'minimum_stock', p_minimum_stock,
    'sale_unit', p_sale_unit
  );

  -- Serializar operaciones del dispositivo.
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

  -- Reconocer cambios previamente confirmados.
  SELECT *
  INTO v_existing_operation
  FROM public.pos_mobile_sync_operations
  WHERE device_id = p_device_id
    AND local_operation_id =
      'product_change:' || p_local_change_id;

  IF FOUND THEN
    IF v_existing_operation.operation_type <> 'inventory'
       OR v_existing_operation.status <> 'completed'
       OR v_existing_operation.server_record_id IS NULL
       OR v_existing_operation.request_payload
          IS DISTINCT FROM v_payload
    THEN
      RAISE EXCEPTION
        'Identificador de operación en conflicto';
    END IF;

    RETURN v_existing_operation.server_record_id;
  END IF;

  SELECT l.product_id
  INTO v_product_id
  FROM public.pos_mobile_product_links l
  WHERE l.device_id = p_device_id
    AND l.local_product_id = p_local_product_id
    AND l.business_id = v_device.business_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Producto móvil sin vincular';
  END IF;

  SELECT *
  INTO v_product
  FROM public.products
  WHERE id = v_product_id
    AND business_id = v_device.business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto remoto inexistente';
  END IF;

  -- Bloquear el inventario para evitar sobrescribir
  -- movimientos concurrentes registrados en la web.
  SELECT stock
  INTO v_stock
  FROM public.branch_inventory
  WHERE business_id = v_device.business_id
    AND branch_id = v_device.branch_id
    AND product_id = v_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventario de sucursal inexistente';
  END IF;

  IF v_stock IS DISTINCT FROM p_previous_stock THEN
    RAISE EXCEPTION
      'Conflicto de inventario: requiere conciliación';
  END IF;

  IF pg_catalog.jsonb_build_object(
       'name', v_product.name,
       'barcode', v_product.barcode,
       'cost_price', v_product.cost_price,
       'sale_price', v_product.sale_price,
       'minimum_stock', (
         SELECT bi.minimum_stock
         FROM public.branch_inventory bi
         WHERE bi.business_id = v_device.business_id
           AND bi.branch_id = v_device.branch_id
           AND bi.product_id = v_product_id
       ),
       'unit', v_product.sale_unit
     ) IS DISTINCT FROM p_previous_data
  THEN
    RAISE EXCEPTION
      'Conflicto de producto: los datos cambiaron en el POS web';
  END IF;

  UPDATE public.products
  SET name = btrim(p_name),
      barcode = nullif(btrim(p_barcode), ''),
      cost_price = p_cost_price,
      sale_price = p_sale_price,
      sale_unit = p_sale_unit,
      updated_at = now()
  WHERE id = v_product_id
    AND business_id = v_device.business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto remoto inexistente';
  END IF;

  UPDATE public.branch_inventory
  SET stock = p_new_stock,
      minimum_stock = p_minimum_stock,
      updated_at = now()
  WHERE product_id = v_product_id
    AND business_id = v_device.business_id
    AND branch_id = v_device.branch_id;

  INSERT INTO public.pos_mobile_sync_operations (
    device_id,
    business_id,
    branch_id,
    local_operation_id,
    operation_type,
    status,
    server_record_id,
    completed_at,
    request_payload
  )
  VALUES (
    p_device_id,
    v_device.business_id,
    v_device.branch_id,
    'product_change:' || p_local_change_id,
    'inventory',
    'completed',
    v_product_id,
    now(),
    v_payload
  );

  RETURN v_product_id;
END;
$$;


--
-- Name: sync_mobile_sale(uuid, uuid, text, jsonb, numeric, numeric, numeric, numeric, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_mobile_sale(p_device_id uuid, p_local_sale_id uuid, p_local_session_id text, p_items jsonb, p_subtotal numeric, p_discount numeric, p_total numeric, p_paid_amount numeric, p_payment_method text, p_created_at timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_device public.pos_devices%ROWTYPE;
  v_session public.cash_sessions%ROWTYPE;
  v_sale_id uuid;
  v_number text;
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_product_id uuid;
  v_quantity numeric;
  v_price numeric;
  v_cost numeric;
  v_line_total numeric;
  v_calculated_subtotal numeric := 0;
  v_stock_before numeric;
  v_expected_stock_before numeric;
  v_stock_after numeric;
  v_change_due numeric;
BEGIN
  IF p_device_id IS NULL
     OR p_local_sale_id IS NULL
     OR p_local_session_id IS NULL
     OR length(p_local_session_id) NOT BETWEEN 1 AND 128
     OR p_items IS NULL
     OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR p_subtotal IS NULL
     OR p_discount IS NULL
     OR p_total IS NULL
     OR p_paid_amount IS NULL
     OR p_created_at IS NULL
     OR p_payment_method NOT IN ('cash', 'card', 'transfer')
     OR p_subtotal < 0
     OR p_discount < 0
     OR p_total < 0
     OR p_paid_amount < 0
  THEN
    RAISE EXCEPTION 'Venta móvil inválida';
  END IF;

  IF jsonb_array_length(p_items) = 0
     OR jsonb_array_length(p_items) > 200
  THEN
    RAISE EXCEPTION 'Cantidad de artículos inválida';
  END IF;

  -- Serializar los reintentos de esta operación.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'mobile-sale:' || p_device_id::text ||
      ':' || p_local_sale_id::text,
      0
    )
  );

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

  -- Una venta confirmada previamente nunca se repite.
  SELECT id INTO v_sale_id
  FROM public.sales
  WHERE business_id = v_device.business_id
    AND client_operation_id = p_local_sale_id
    AND origin = 'offline_sync';

  IF v_sale_id IS NOT NULL THEN
    -- Un reintento debe corresponder exactamente
    -- a la venta que ya fue confirmada.
    IF NOT EXISTS (
      SELECT 1
      FROM public.sales s
      JOIN public.pos_mobile_cash_session_links l
        ON l.cash_session_id = s.cash_session_id
      WHERE s.id = v_sale_id
        AND s.business_id = v_device.business_id
        AND s.branch_id = v_device.branch_id
        AND l.device_id = p_device_id
        AND l.local_session_id = p_local_session_id
        AND l.business_id = v_device.business_id
        AND l.branch_id = v_device.branch_id
        AND s.subtotal = p_subtotal
        AND s.discount = p_discount
        AND s.total = p_total
        AND s.paid_amount = p_paid_amount
        AND s.payment_method = p_payment_method
        AND s.created_at = p_created_at
    ) THEN
      RAISE EXCEPTION
        'La venta ya sincronizada tiene datos diferentes';
    END IF;

    -- EXCEPT ALL conserva las repeticiones:
    -- dos líneas iguales no equivalen a una sola.
    IF EXISTS (
      SELECT 1
      FROM (
        (
          SELECT
            si.product_id,
            si.quantity,
            si.unit_price,
            si.unit_cost
          FROM public.sale_items si
          WHERE si.sale_id = v_sale_id
        )
        EXCEPT ALL
        (
          SELECT
            l.product_id,
            (item.value->>'quantity')::numeric,
            (item.value->>'unit_price')::numeric,
            (item.value->>'unit_cost')::numeric
          FROM pg_catalog.jsonb_array_elements(p_items)
            AS item(value)
          LEFT JOIN public.pos_mobile_product_links l
            ON l.device_id = p_device_id
           AND l.business_id = v_device.business_id
           AND l.local_product_id =
             item.value->>'local_product_id'
        )
      ) difference
    )
    OR EXISTS (
      SELECT 1
      FROM (
        (
          SELECT
            l.product_id,
            (item.value->>'quantity')::numeric,
            (item.value->>'unit_price')::numeric,
            (item.value->>'unit_cost')::numeric
          FROM pg_catalog.jsonb_array_elements(p_items)
            AS item(value)
          LEFT JOIN public.pos_mobile_product_links l
            ON l.device_id = p_device_id
           AND l.business_id = v_device.business_id
           AND l.local_product_id =
             item.value->>'local_product_id'
        )
        EXCEPT ALL
        (
          SELECT
            si.product_id,
            si.quantity,
            si.unit_price,
            si.unit_cost
          FROM public.sale_items si
          WHERE si.sale_id = v_sale_id
        )
      ) difference
    )
    THEN
      RAISE EXCEPTION
        'Los artículos de la venta sincronizada no coinciden';
    END IF;

    RETURN v_sale_id;
  END IF;

  -- Resolver la caja correspondiente al identificador local.
  SELECT cs.*
  INTO v_session
  FROM public.cash_sessions cs
  JOIN public.pos_mobile_cash_session_links l
    ON l.cash_session_id = cs.id
  WHERE l.device_id = p_device_id
    AND l.local_session_id = p_local_session_id
    AND l.business_id = v_device.business_id
    AND l.branch_id = v_device.branch_id
    AND cs.business_id = v_device.business_id
    AND cs.branch_id = v_device.branch_id
  FOR UPDATE OF cs;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caja móvil no sincronizada';
  END IF;

  IF p_created_at < v_session.opened_at
     OR (
       v_session.closed_at IS NOT NULL
       AND p_created_at > v_session.closed_at
     )
  THEN
    RAISE EXCEPTION 'Venta fuera del período de caja';
  END IF;

  v_number :=
    'M-' ||
    replace(p_local_sale_id::text, '-', '');

  INSERT INTO public.sales (
    number,
    subtotal,
    discount,
    total,
    paid_amount,
    change_due,
    payment_method,
    cash_session_id,
    business_id,
    branch_id,
    client_operation_id,
    origin,
    created_at
  )
  VALUES (
    v_number,
    p_subtotal,
    p_discount,
    p_total,
    p_paid_amount,
    CASE
      WHEN p_payment_method = 'cash'
      THEN p_paid_amount - p_total
      ELSE 0
    END,
    p_payment_method,
    v_session.id,
    v_device.business_id,
    v_device.branch_id,
    p_local_sale_id,
    'offline_sync',
    p_created_at
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR nullif(v_item->>'local_product_id', '') IS NULL
       OR length(v_item->>'local_product_id') > 128
    THEN
      RAISE EXCEPTION 'Artículo móvil inválido';
    END IF;

    v_quantity := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;
    v_expected_stock_before :=
      (v_item->>'expected_stock_before')::numeric;

    IF v_quantity IS NULL
       OR v_quantity <= 0
       OR v_quantity <> round(v_quantity, 3)
       OR v_price IS NULL
       OR v_price < 0
       OR v_cost IS NULL
       OR v_cost < 0
       OR v_expected_stock_before IS NULL
       OR v_expected_stock_before < 0
       OR v_expected_stock_before <>
          round(v_expected_stock_before, 3)
    THEN
      RAISE EXCEPTION 'Cantidad, precio o stock inválido';
    END IF;

    SELECT l.product_id
    INTO v_product_id
    FROM public.pos_mobile_product_links l
    WHERE l.device_id = p_device_id
      AND l.business_id = v_device.business_id
      AND l.local_product_id =
        v_item->>'local_product_id';

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Producto no sincronizado';
    END IF;

    SELECT *
    INTO v_product
    FROM public.products
    WHERE id = v_product_id
      AND business_id = v_device.business_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no disponible';
    END IF;

    IF v_product.sale_unit = 'piece'
       AND v_quantity <> trunc(v_quantity)
    THEN
      RAISE EXCEPTION 'Cantidad por pieza inválida';
    END IF;

    SELECT stock
    INTO v_stock_before
    FROM public.branch_inventory
    WHERE business_id = v_device.business_id
      AND branch_id = v_device.branch_id
      AND product_id = v_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventario inexistente';
    END IF;

    IF v_stock_before IS DISTINCT FROM
       v_expected_stock_before
    THEN
      RAISE EXCEPTION
        'Conflicto de inventario: stock remoto diferente';
    END IF;

    IF v_stock_before < v_quantity THEN
      RAISE EXCEPTION 'Inventario insuficiente';
    END IF;

    v_stock_after := v_stock_before - v_quantity;
    v_line_total := round(v_price * v_quantity, 2);

    INSERT INTO public.sale_items (
      sale_id,
      product_id,
      name,
      unit_price,
      unit_cost,
      quantity,
      subtotal,
      business_id,
      created_at
    )
    VALUES (
      v_sale_id,
      v_product_id,
      v_product.name,
      v_price,
      v_cost,
      v_quantity,
      v_line_total,
      v_device.business_id,
      p_created_at
    );

    UPDATE public.branch_inventory
    SET stock = v_stock_after,
        updated_at = now()
    WHERE business_id = v_device.business_id
      AND branch_id = v_device.branch_id
      AND product_id = v_product_id;

    INSERT INTO public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reference_id,
      note,
      user_id,
      business_id,
      branch_id
    )
    VALUES (
      v_product_id,
      'sale',
      -v_quantity,
      v_stock_before,
      v_stock_after,
      v_sale_id,
      'Venta móvil ' || v_number,
      NULL,
      v_device.business_id,
      v_device.branch_id
    );

    v_calculated_subtotal :=
      v_calculated_subtotal + v_line_total;
  END LOOP;

  IF abs(v_calculated_subtotal - p_subtotal) > 0.01
     OR abs((p_subtotal - p_discount) - p_total) > 0.01
     OR (
       p_payment_method = 'cash'
       AND p_paid_amount < p_total
     )
     OR (
       p_payment_method <> 'cash'
       AND abs(p_paid_amount - p_total) > 0.01
     )
  THEN
    RAISE EXCEPTION 'Los importes de la venta no coinciden';
  END IF;

  v_change_due :=
    CASE
      WHEN p_payment_method = 'cash'
      THEN p_paid_amount - p_total
      ELSE 0
    END;

  UPDATE public.sales
  SET change_due = v_change_due
  WHERE id = v_sale_id;

  RETURN v_sale_id;
END;
$$;


--
-- Name: sync_offline_cash_movement(uuid, uuid, text, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_offline_cash_movement(p_cash_session_id uuid, p_reference_id uuid, p_movement_type text, p_amount numeric, p_concept text) RETURNS public.cash_movements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
    v_session public.cash_sessions%rowtype;
    v_business_id uuid;
    v_branch_id uuid;

    v_cash_sales numeric := 0;
    v_income numeric := 0;
    v_expense numeric := 0;
    v_available numeric := 0;

    v_existing public.cash_movements%rowtype;
    v_movement public.cash_movements%rowtype;
begin

    if auth.uid() is null then
        raise exception 'Usuario no autenticado';
    end if;

    if not public.is_active_user() then
        raise exception 'Usuario inactivo';
    end if;

    v_business_id := public.current_business_id();

    if v_business_id is null then
        raise exception
            'No se pudo determinar el negocio del usuario';
    end if;

    if not public.has_operational_subscription() then
        raise exception
            'La suscripción del negocio no permite realizar operaciones de caja';
    end if;

    if p_reference_id is null then
        raise exception 'El identificador del movimiento es obligatorio';
    end if;

    if p_movement_type not in ('income', 'expense') then
        raise exception 'Tipo de movimiento no válido';
    end if;

    if p_amount is null or p_amount <= 0 then
        raise exception 'El monto debe ser mayor a cero';
    end if;

    if nullif(trim(p_concept), '') is null then
        raise exception 'El concepto es obligatorio';
    end if;

    /*
     * Primero comprobamos idempotencia.
     *
     * Si Android ya envió este UUID anteriormente,
     * regresamos exactamente el movimiento existente.
     */
    select *
    into v_existing
    from public.cash_movements
    where business_id = v_business_id
      and reference_id = p_reference_id
    limit 1;

    if found then

        /*
         * Además verificamos que el UUID no esté intentando
         * representar un movimiento diferente.
         */
        if v_existing.cash_session_id <> p_cash_session_id
           or v_existing.movement_type <> p_movement_type
           or v_existing.amount <> p_amount
           or v_existing.concept <> trim(p_concept) then

            raise exception
                'El movimiento ya existe con datos diferentes';
        end if;

        return v_existing;
    end if;

    /*
     * Bloqueamos la sesión de caja mientras calculamos
     * el efectivo disponible y registramos el movimiento.
     */
    select *
    into v_session
    from public.cash_sessions
    where id = p_cash_session_id
      and business_id = v_business_id
    for update;

    if not found then
        raise exception
            'La sesión de caja no existe o no pertenece a tu negocio';
    end if;

    if v_session.status <> 'open' then
        raise exception 'La caja está cerrada';
    end if;

    v_branch_id := v_session.branch_id;

    if v_branch_id is null then
        raise exception
            'La sesión de caja no tiene una sucursal asignada';
    end if;

    if not public.has_branch_access(v_branch_id) then
        raise exception
            'No tienes acceso a la sucursal de esta caja';
    end if;

    /*
     * Efectivo neto recibido mediante ventas.
     */
    select coalesce(
        sum(
            coalesce(paid_amount, 0)
            - coalesce(change_due, 0)
        ),
        0
    )
    into v_cash_sales
    from public.sales
    where cash_session_id = p_cash_session_id
      and business_id = v_business_id
      and branch_id = v_branch_id
      and payment_method = 'cash';

    /*
     * Entradas manuales.
     */
    select coalesce(sum(amount), 0)
    into v_income
    from public.cash_movements
    where cash_session_id = p_cash_session_id
      and business_id = v_business_id
      and branch_id = v_branch_id
      and movement_type = 'income';

    /*
     * Salidas manuales.
     */
    select coalesce(sum(amount), 0)
    into v_expense
    from public.cash_movements
    where cash_session_id = p_cash_session_id
      and business_id = v_business_id
      and branch_id = v_branch_id
      and movement_type = 'expense';

    v_available :=
        coalesce(v_session.opening_amount, 0)
        + v_cash_sales
        + v_income
        - v_expense;

    if p_movement_type = 'expense'
       and p_amount > v_available then

        raise exception
            'Fondos insuficientes. Disponible en caja: $%',
            round(v_available, 2);
    end if;

    insert into public.cash_movements (
        cash_session_id,
        movement_type,
        amount,
        concept,
        reference_id,
        user_id,
        business_id,
        branch_id
    )
    values (
        p_cash_session_id,
        p_movement_type,
        p_amount,
        trim(p_concept),
        p_reference_id,
        auth.uid(),
        v_business_id,
        v_branch_id
    )
    on conflict (business_id, reference_id)
        where reference_id is not null
    do nothing
    returning *
    into v_movement;

    /*
     * Esto cubre incluso dos solicitudes concurrentes
     * intentando sincronizar el mismo UUID.
     */
    if v_movement.id is null then

        select *
        into v_movement
        from public.cash_movements
        where business_id = v_business_id
          and reference_id = p_reference_id;

        if not found then
            raise exception
                'No se pudo recuperar el movimiento sincronizado';
        end if;
    end if;

    return v_movement;

end;
$_$;


--
-- Name: sync_offline_cash_session_close(uuid, numeric, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_offline_cash_session_close(p_cash_session_id uuid, p_closing_amount numeric, p_closed_at timestamp with time zone) RETURNS public.cash_sessions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_session public.cash_sessions%rowtype;
    v_business_id uuid;
    v_branch_id uuid;

    v_cash_sales numeric := 0;
    v_income numeric := 0;
    v_expense numeric := 0;

    v_expected numeric := 0;
    v_difference numeric := 0;
begin

    if auth.uid() is null then
        raise exception 'Usuario no autenticado';
    end if;

    if not public.is_active_user() then
        raise exception 'Usuario inactivo';
    end if;

    v_business_id := public.current_business_id();

    if v_business_id is null then
        raise exception
            'No se pudo determinar el negocio del usuario';
    end if;

    if not public.has_operational_subscription() then
        raise exception
            'La suscripción del negocio no permite realizar operaciones de caja';
    end if;

    if p_cash_session_id is null then
        raise exception
            'El identificador de la sesión de caja es obligatorio';
    end if;

    if p_closing_amount is null
       or p_closing_amount < 0 then
        raise exception
            'El efectivo contado no puede ser negativo';
    end if;

    if p_closed_at is null then
        raise exception
            'La fecha de cierre es obligatoria';
    end if;

    /*
     * Obtener y bloquear la sesión.
     */
    select *
    into v_session
    from public.cash_sessions
    where id = p_cash_session_id
      and business_id = v_business_id
    for update;

    if not found then
        raise exception
            'La sesión de caja no existe o no pertenece a tu negocio';
    end if;

    v_branch_id := v_session.branch_id;

    if v_branch_id is null then
        raise exception
            'La sesión de caja no tiene una sucursal asignada';
    end if;

    if not public.has_branch_access(v_branch_id) then
        raise exception
            'No tienes acceso a la sucursal de esta caja';
    end if;

    /*
     * IDEMPOTENCIA DEL CIERRE.
     *
     * Si ya está cerrada, un reintento con el mismo
     * efectivo contado se considera exitoso.
     *
     * Si intenta cerrarla nuevamente con otra cantidad,
     * rechazamos la operación.
     */
    if v_session.status = 'closed' then

        if v_session.closing_amount = p_closing_amount then
            return v_session;
        end if;

        raise exception
            'La caja ya está cerrada con un efectivo contado diferente';
    end if;

    if v_session.status <> 'open' then
        raise exception
            'El estado de la sesión de caja no permite cerrarla';
    end if;

    /*
     * Ventas en efectivo que realmente llegaron
     * al servidor para esta sesión.
     */
    select coalesce(
        sum(
            coalesce(paid_amount, 0)
            - coalesce(change_due, 0)
        ),
        0
    )
    into v_cash_sales
    from public.sales
    where cash_session_id = p_cash_session_id
      and business_id = v_business_id
      and branch_id = v_branch_id
      and payment_method = 'cash';

    /*
     * Entradas de efectivo.
     */
    select coalesce(sum(amount), 0)
    into v_income
    from public.cash_movements
    where cash_session_id = p_cash_session_id
      and business_id = v_business_id
      and branch_id = v_branch_id
      and movement_type = 'income';

    /*
     * Salidas de efectivo.
     *
     * Aquí también quedan reflejadas las devoluciones
     * en efectivo que crean un cash movement de expense.
     */
    select coalesce(sum(amount), 0)
    into v_expense
    from public.cash_movements
    where cash_session_id = p_cash_session_id
      and business_id = v_business_id
      and branch_id = v_branch_id
      and movement_type = 'expense';

    /*
     * Supabase es la autoridad financiera final.
     *
     * No utilizamos expected_amount ni difference
     * calculados por Android.
     */
    v_expected :=
        coalesce(v_session.opening_amount, 0)
        + v_cash_sales
        + v_income
        - v_expense;

    v_difference :=
        p_closing_amount
        - v_expected;

    update public.cash_sessions
    set
        closed_at = p_closed_at,
        closing_amount = p_closing_amount,
        expected_amount = v_expected,
        difference = v_difference,
        status = 'closed',
        closed_by = auth.uid()
    where id = p_cash_session_id
      and business_id = v_business_id
      and branch_id = v_branch_id
      and status = 'open'
    returning *
    into v_session;

    if not found then
        raise exception
            'No se pudo cerrar la sesión de caja';
    end if;

    return v_session;

end;
$$;


--
-- Name: sync_offline_cash_session_open(uuid, uuid, numeric, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_offline_cash_session_open(p_cash_session_id uuid, p_branch_id uuid, p_opening_amount numeric, p_opened_at timestamp with time zone) RETURNS public.cash_sessions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_session public.cash_sessions%rowtype;
    v_business_id uuid;
begin

    if auth.uid() is null then
        raise exception 'Usuario no autenticado';
    end if;

    if not public.is_active_user() then
        raise exception 'Usuario inactivo';
    end if;

    v_business_id := public.current_business_id();

    if v_business_id is null then
        raise exception
            'No se pudo determinar el negocio del usuario';
    end if;

    if not public.has_operational_subscription() then
        raise exception
            'La suscripción del negocio no permite realizar operaciones de caja';
    end if;

    if p_cash_session_id is null then
        raise exception
            'El identificador de la sesión de caja es obligatorio';
    end if;

    if p_branch_id is null then
        raise exception
            'La sucursal es obligatoria';
    end if;

    if not public.has_branch_access(p_branch_id) then
        raise exception
            'No tienes acceso a esta sucursal';
    end if;

    if not exists (
        select 1
        from public.branches br
        where br.id = p_branch_id
          and br.business_id = v_business_id
          and br.active = true
    ) then
        raise exception
            'La sucursal no existe, está inactiva o no pertenece a tu negocio';
    end if;

    if p_opening_amount is null
       or p_opening_amount < 0 then
        raise exception
            'El fondo inicial no puede ser negativo';
    end if;

    if p_opened_at is null then
        raise exception
            'La fecha de apertura es obligatoria';
    end if;

    /*
     * IDEMPOTENCIA
     *
     * Si este UUID ya existe, puede tratarse de un
     * reintento de WorkManager.
     *
     * Solo lo aceptamos como el mismo evento cuando
     * pertenece al mismo negocio y sucursal y conserva
     * los datos esenciales de la apertura.
     */
    select *
    into v_session
    from public.cash_sessions cs
    where cs.id = p_cash_session_id;

    if found then

        if v_session.business_id <> v_business_id
           or v_session.branch_id <> p_branch_id then
            raise exception
                'La sesión de caja ya existe con datos diferentes';
        end if;

        if v_session.opening_amount <> p_opening_amount then
            raise exception
                'La sesión de caja ya existe con un fondo inicial diferente';
        end if;

        return v_session;
    end if;

    /*
     * No permitimos que una apertura offline ignore
     * una caja distinta que ya esté abierta en esta
     * sucursal.
     */
    if exists (
        select 1
        from public.cash_sessions cs
        where cs.status = 'open'
          and cs.business_id = v_business_id
          and cs.branch_id = p_branch_id
          and cs.id <> p_cash_session_id
    ) then
        raise exception
            'Ya existe una caja abierta para esta sucursal';
    end if;

    insert into public.cash_sessions (
        id,
        opened_at,
        opening_amount,
        status,
        opened_by,
        business_id,
        branch_id
    )
    values (
        p_cash_session_id,
        p_opened_at,
        p_opening_amount,
        'open',
        auth.uid(),
        v_business_id,
        p_branch_id
    )
    returning *
    into v_session;

    return v_session;

exception
    when unique_violation then

        /*
         * Protección adicional contra carreras:
         *
         * dos dispositivos podrían intentar abrir
         * caja prácticamente al mismo tiempo.
         *
         * El índice único parcial del servidor sigue
         * siendo la última autoridad.
         */
        select *
        into v_session
        from public.cash_sessions cs
        where cs.id = p_cash_session_id;

        if found
           and v_session.business_id = v_business_id
           and v_session.branch_id = p_branch_id
           and v_session.opening_amount = p_opening_amount then
            return v_session;
        end if;

        raise exception
            'Ya existe una caja abierta para esta sucursal';

end;
$$;


--
-- Name: sync_offline_product(uuid, text, text, numeric, numeric, numeric, numeric, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_offline_product(p_product_id uuid, p_name text, p_barcode text, p_cost_price numeric, p_sale_price numeric, p_initial_stock numeric, p_minimum_stock numeric, p_branch_id uuid, p_sale_unit text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
  v_branch record;
  v_existing_business_id uuid;
begin

  -- Usuario autenticado
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  -- Solo administradores y managers
  if not public.has_role(array['admin', 'manager']) then
    raise exception 'No tienes permisos para crear productos';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite crear productos';
  end if;

  -- Validaciones básicas
  if p_product_id is null then
    raise exception 'El ID del producto es obligatorio';
  end if;

  if p_branch_id is null then
    raise exception 'La sucursal es obligatoria';
  end if;

  if not public.has_branch_access(p_branch_id) then
    raise exception 'No tienes acceso a esta sucursal';
  end if;

  if not exists (
    select 1
    from public.branches br
    where br.id = p_branch_id
      and br.business_id = v_business_id
      and br.active = true
  ) then
    raise exception
      'La sucursal no existe, está inactiva o no pertenece a tu negocio';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'El nombre del producto es obligatorio';
  end if;

  if p_cost_price is null or p_cost_price < 0 then
    raise exception 'El costo no puede ser negativo';
  end if;

  if p_sale_price is null or p_sale_price < 0 then
    raise exception 'El precio de venta no puede ser negativo';
  end if;

  if p_initial_stock is null or p_initial_stock < 0 then
    raise exception 'El stock inicial no puede ser negativo';
  end if;

  if p_minimum_stock is null or p_minimum_stock < 0 then
    raise exception 'El stock mínimo no puede ser negativo';
  end if;

  if p_sale_unit is null
     or p_sale_unit not in ('piece', 'kg') then
    raise exception 'Unidad de venta no válida';
  end if;

  -- Los productos por pieza no aceptan fracciones.
  if p_sale_unit = 'piece'
     and (
       p_initial_stock <> trunc(p_initial_stock)
       or p_minimum_stock <> trunc(p_minimum_stock)
     ) then
    raise exception
      'Los productos por pieza deben usar cantidades enteras';
  end if;

  /*
   * IDEMPOTENCIA
   *
   * Si el producto ya existe con este UUID:
   * - debe pertenecer al mismo negocio;
   * - no volvemos a crear inventarios;
   * - no volvemos a registrar el stock inicial.
   */
  select p.business_id
  into v_existing_business_id
  from public.products p
  where p.id = p_product_id;

  if found then

    if v_existing_business_id <> v_business_id then
      raise exception
        'El producto ya existe y pertenece a otro negocio';
    end if;

    return jsonb_build_object(
      'product_id', p_product_id,
      'branch_id', p_branch_id,
      'already_synced', true
    );

  end if;

  -- Crear producto usando exactamente el UUID generado por Android.
  insert into public.products (
    id,
    name,
    barcode,
    cost_price,
    sale_price,
    sale_unit,
    business_id
  )
  values (
    p_product_id,
    trim(p_name),
    nullif(trim(p_barcode), ''),
    p_cost_price,
    p_sale_price,
    p_sale_unit,
    v_business_id
  );

  /*
   * Igual que create_product:
   * crear inventario para todas las sucursales activas.
   *
   * La sucursal desde la que se creó recibe el stock inicial.
   * Las demás comienzan en cero.
   */
  for v_branch in
    select br.id
    from public.branches br
    where br.business_id = v_business_id
      and br.active = true
  loop

    insert into public.branch_inventory (
      business_id,
      branch_id,
      product_id,
      stock,
      minimum_stock
    )
    values (
      v_business_id,
      v_branch.id,
      p_product_id,
      case
        when v_branch.id = p_branch_id
          then p_initial_stock
        else 0
      end,
      case
        when v_branch.id = p_branch_id
          then p_minimum_stock
        else 0
      end
    );

  end loop;

  -- Registrar el stock inicial una sola vez.
  if p_initial_stock > 0 then

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      note,
      user_id,
      business_id,
      branch_id
    )
    values (
      p_product_id,
      'stock_in',
      p_initial_stock,
      0,
      p_initial_stock,
      'Stock inicial del producto',
      auth.uid(),
      v_business_id,
      p_branch_id
    );

  end if;

  return jsonb_build_object(
    'product_id', p_product_id,
    'branch_id', p_branch_id,
    'name', trim(p_name),
    'barcode', nullif(trim(p_barcode), ''),
    'cost_price', p_cost_price,
    'sale_price', p_sale_price,
    'sale_unit', p_sale_unit,
    'stock', p_initial_stock,
    'minimum_stock', p_minimum_stock,
    'already_synced', false
  );

end;
$$;


--
-- Name: sync_offline_sale(uuid, jsonb, numeric, timestamp with time zone, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_offline_sale(p_sale_id uuid, p_items jsonb, p_paid_amount numeric, p_created_at timestamp with time zone, p_payment_method text DEFAULT 'cash'::text, p_branch_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$

declare
    v_cash_session_id uuid;
    v_business_id uuid;

    v_item jsonb;
    v_product products%rowtype;

    v_quantity numeric;
    v_subtotal numeric := 0;
    v_total numeric := 0;
    v_change_due numeric := 0;
    v_paid_amount numeric := 0;

    v_number text;

    v_stock_before numeric;
    v_stock_after numeric;

    v_existing_sale sales%rowtype;

begin

    -- =====================================================
    -- SEGURIDAD
    -- =====================================================

    if auth.uid() is null then
        raise exception 'Usuario no autenticado';
    end if;

    if not public.is_active_user() then
        raise exception 'Usuario inactivo o sin autorización';
    end if;

    v_business_id := public.current_business_id();

    if v_business_id is null then
        raise exception 'No se pudo determinar el negocio del usuario';
    end if;


    -- =====================================================
    -- VALIDAR IDENTIFICADOR
    -- =====================================================

    if p_sale_id is null then
        raise exception 'El identificador de la venta es obligatorio';
    end if;


    -- =====================================================
    -- IDEMPOTENCIA
    --
    -- Si Android ya sincronizó esta venta anteriormente,
    -- simplemente devolvemos la venta existente.
    -- NO volvemos a descontar inventario.
    -- =====================================================

    select *
    into v_existing_sale
    from public.sales
    where id = p_sale_id;

    if found then

        -- Un UUID existente nunca puede utilizarse para
        -- acceder a una venta de otro negocio.
        if v_existing_sale.business_id <> v_business_id then
            raise exception 'El identificador de venta ya está en uso';
        end if;

        if v_existing_sale.branch_id <> p_branch_id then
            raise exception 'La venta ya existe en otra sucursal';
        end if;

        return jsonb_build_object(
            'sale_id', v_existing_sale.id,
            'number', v_existing_sale.number,
            'cash_session_id', v_existing_sale.cash_session_id,
            'branch_id', v_existing_sale.branch_id,
            'subtotal', v_existing_sale.subtotal,
            'total', v_existing_sale.total,
            'paid_amount', v_existing_sale.paid_amount,
            'change_due', v_existing_sale.change_due,
            'payment_method', v_existing_sale.payment_method,
            'created_at', v_existing_sale.created_at,
            'already_synced', true
        );

    end if;


    -- =====================================================
    -- SUSCRIPCIÓN
    -- =====================================================

    if not public.has_operational_subscription() then
        raise exception
            'La suscripción del negocio no permite realizar ventas';
    end if;


    -- =====================================================
    -- VALIDAR SUCURSAL
    -- =====================================================

    if p_branch_id is null then
        raise exception 'La sucursal es obligatoria';
    end if;

    if not public.has_branch_access(p_branch_id) then
        raise exception 'No tienes acceso a esta sucursal';
    end if;

    if not exists (
        select 1
        from public.branches br
        where br.id = p_branch_id
          and br.business_id = v_business_id
          and br.active = true
    ) then
        raise exception
            'La sucursal no existe, está inactiva o no pertenece a tu negocio';
    end if;


    -- =====================================================
    -- VALIDAR FECHA ORIGINAL
    -- =====================================================

    if p_created_at is null then
        raise exception 'La fecha original de la venta es obligatoria';
    end if;


    -- =====================================================
    -- VALIDAR CARRITO
    -- =====================================================

    if p_items is null
       or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) = 0 then
        raise exception 'El carrito está vacío';
    end if;


    -- =====================================================
    -- VALIDAR MÉTODO DE PAGO
    -- =====================================================

    if p_payment_method not in ('cash', 'card', 'transfer') then
        raise exception 'Método de pago no válido';
    end if;


    -- =====================================================
    -- BUSCAR CAJA ABIERTA
    -- =====================================================

    select cs.id
    into v_cash_session_id
    from public.cash_sessions cs
    where cs.status = 'open'
      and cs.business_id = v_business_id
      and cs.branch_id = p_branch_id
    order by cs.opened_at desc
    limit 1;

    if v_cash_session_id is null then
        raise exception
            'No hay una caja abierta para esta sucursal. Abre caja antes de sincronizar la venta.';
    end if;


    -- =====================================================
    -- GENERAR NÚMERO DE VENTA
    -- =====================================================

    v_number :=
        'V-' ||
        to_char(p_created_at, 'YYYYMMDD-HH24MISS') ||
        '-' ||
        lpad(floor(random() * 1000)::text, 3, '0');


    -- =====================================================
    -- CREAR VENTA CON EL UUID GENERADO POR ANDROID
    -- =====================================================

    insert into public.sales (
        id,
        number,
        subtotal,
        discount,
        total,
        paid_amount,
        change_due,
        cash_session_id,
        payment_method,
        user_id,
        business_id,
        branch_id,
        created_at,
        updated_at
    )
    values (
        p_sale_id,
        v_number,
        0,
        0,
        0,
        0,
        0,
        v_cash_session_id,
        p_payment_method,
        auth.uid(),
        v_business_id,
        p_branch_id,
        p_created_at,
        now()
    );


    -- =====================================================
    -- PROCESAR PRODUCTOS
    -- =====================================================

    for v_item in
        select value
        from jsonb_array_elements(p_items)
    loop

        v_quantity := (v_item->>'quantity')::numeric;

        if v_quantity is null or v_quantity <= 0 then
            raise exception 'Cantidad inválida';
        end if;

        if v_quantity <> round(v_quantity, 3) then
            raise exception
                'La cantidad no puede tener más de 3 decimales';
        end if;


        -- =================================================
        -- BUSCAR PRODUCTO
        -- =================================================

        select *
        into v_product
        from public.products
        where id = (v_item->>'product_id')::uuid
          and business_id = v_business_id;

        if not found then
            raise exception
                'Producto no encontrado o no pertenece a tu negocio';
        end if;


        -- =================================================
        -- VALIDAR UNIDAD
        -- =================================================

        if v_product.sale_unit = 'piece'
           and v_quantity <> trunc(v_quantity) then
            raise exception
                'El producto "%" se vende por pieza y requiere una cantidad entera',
                v_product.name;
        end if;


        -- =================================================
        -- BLOQUEAR INVENTARIO
        -- =================================================

        select bi.stock
        into v_stock_before
        from public.branch_inventory bi
        where bi.business_id = v_business_id
          and bi.branch_id = p_branch_id
          and bi.product_id = v_product.id
        for update;

        if not found then
            raise exception
                'El producto % no tiene inventario asignado en esta sucursal',
                v_product.name;
        end if;


        -- =================================================
        -- VALIDAR STOCK
        -- =================================================

        if v_stock_before < v_quantity then
            raise exception
                'Stock insuficiente para % en esta sucursal. Disponible: %, solicitado: %',
                v_product.name,
                v_stock_before,
                v_quantity;
        end if;


        v_stock_after :=
            v_stock_before - v_quantity;

        v_subtotal :=
            v_subtotal +
            (v_product.sale_price * v_quantity);


        -- =================================================
        -- DETALLE DE VENTA
        -- =================================================

        if nullif(v_item->>'sale_item_id', '') is null then
            raise exception
                'Cada artículo debe incluir sale_item_id';
        end if;

        insert into public.sale_items (
            id,
            sale_id,
            product_id,
            name,
            unit_price,
            unit_cost,
            quantity,
            subtotal,
            business_id,
            created_at
        )
        values (
            (v_item->>'sale_item_id')::uuid,
            p_sale_id,
            v_product.id,
            v_product.name,
            v_product.sale_price,
            v_product.cost_price,
            v_quantity,
            v_product.sale_price * v_quantity,
            v_business_id,
            p_created_at
        );


        -- =================================================
        -- DESCONTAR STOCK
        -- =================================================

        update public.branch_inventory
        set
            stock = v_stock_after,
            updated_at = now()
        where business_id = v_business_id
          and branch_id = p_branch_id
          and product_id = v_product.id;


        -- =================================================
        -- MOVIMIENTO DE INVENTARIO
        -- =================================================

        insert into public.inventory_movements (
            product_id,
            movement_type,
            quantity,
            stock_before,
            stock_after,
            reference_id,
            note,
            user_id,
            business_id,
            branch_id,
            created_at
        )
        values (
            v_product.id,
            'sale',
            -v_quantity,
            v_stock_before,
            v_stock_after,
            NULL,
            'Venta ' || v_number,
            auth.uid(),
            v_business_id,
            p_branch_id,
            p_created_at
        );

    end loop;


    -- =====================================================
    -- TOTAL
    -- =====================================================

    v_total := v_subtotal;


    -- =====================================================
    -- PAGO
    -- =====================================================

    if p_payment_method = 'cash' then

        if p_paid_amount is null
           or p_paid_amount < v_total then
            raise exception
                'Efectivo insuficiente. Total: %, recibido: %',
                v_total,
                coalesce(p_paid_amount, 0);
        end if;

        v_paid_amount := p_paid_amount;
        v_change_due := p_paid_amount - v_total;

    elsif p_payment_method in ('card', 'transfer') then

        v_paid_amount := v_total;
        v_change_due := 0;

    end if;


    -- =====================================================
    -- FINALIZAR VENTA
    -- =====================================================

    update public.sales
    set
        subtotal = v_subtotal,
        total = v_total,
        paid_amount = v_paid_amount,
        change_due = v_change_due,
        payment_method = p_payment_method,
        updated_at = now()
    where id = p_sale_id
      and business_id = v_business_id
      and branch_id = p_branch_id;


    -- =====================================================
    -- RESPUESTA
    -- =====================================================

    return jsonb_build_object(
        'sale_id', p_sale_id,
        'number', v_number,
        'cash_session_id', v_cash_session_id,
        'branch_id', p_branch_id,
        'subtotal', v_subtotal,
        'total', v_total,
        'paid_amount', v_paid_amount,
        'change_due', v_change_due,
        'payment_method', p_payment_method,
        'created_at', p_created_at,
        'already_synced', false
    );

end;

$$;


--
-- Name: sync_offline_sale(uuid, jsonb, numeric, timestamp with time zone, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_offline_sale(p_sale_id uuid, p_items jsonb, p_paid_amount numeric, p_created_at timestamp with time zone, p_payment_method text, p_branch_id uuid, p_cash_session_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_business_id uuid;

    v_item jsonb;
    v_product products%rowtype;

    v_quantity numeric;
    v_subtotal numeric := 0;
    v_total numeric := 0;
    v_change_due numeric := 0;
    v_paid_amount numeric := 0;

    v_number text;

    v_stock_before numeric;
    v_stock_after numeric;

    v_existing_sale sales%rowtype;

begin

    -- =====================================================
    -- SEGURIDAD
    -- =====================================================

    if auth.uid() is null then
        raise exception 'Usuario no autenticado';
    end if;

    if not public.is_active_user() then
        raise exception 'Usuario inactivo o sin autorización';
    end if;

    v_business_id := public.current_business_id();

    if v_business_id is null then
        raise exception
            'No se pudo determinar el negocio del usuario';
    end if;


    -- =====================================================
    -- VALIDAR IDENTIFICADOR
    -- =====================================================

    if p_sale_id is null then
        raise exception
            'El identificador de la venta es obligatorio';
    end if;


    -- =====================================================
    -- IDEMPOTENCIA
    -- =====================================================

    select *
    into v_existing_sale
    from public.sales
    where id = p_sale_id;

    if found then

        if v_existing_sale.business_id <> v_business_id then
            raise exception
                'El identificador de venta ya está en uso';
        end if;

        if v_existing_sale.branch_id <> p_branch_id then
            raise exception
                'La venta ya existe en otra sucursal';
        end if;

        /*
         * La misma venta tampoco puede reaparecer
         * asociada a otra sesión de caja.
         */
        if v_existing_sale.cash_session_id <> p_cash_session_id then
            raise exception
                'La venta ya existe asociada a otra sesión de caja';
        end if;

        return jsonb_build_object(
            'sale_id', v_existing_sale.id,
            'number', v_existing_sale.number,
            'cash_session_id', v_existing_sale.cash_session_id,
            'branch_id', v_existing_sale.branch_id,
            'subtotal', v_existing_sale.subtotal,
            'total', v_existing_sale.total,
            'paid_amount', v_existing_sale.paid_amount,
            'change_due', v_existing_sale.change_due,
            'payment_method', v_existing_sale.payment_method,
            'created_at', v_existing_sale.created_at,
            'already_synced', true
        );

    end if;


    -- =====================================================
    -- SUSCRIPCIÓN
    -- =====================================================

    if not public.has_operational_subscription() then
        raise exception
            'La suscripción del negocio no permite realizar ventas';
    end if;


    -- =====================================================
    -- VALIDAR SUCURSAL
    -- =====================================================

    if p_branch_id is null then
        raise exception 'La sucursal es obligatoria';
    end if;

    if not public.has_branch_access(p_branch_id) then
        raise exception
            'No tienes acceso a esta sucursal';
    end if;

    if not exists (
        select 1
        from public.branches br
        where br.id = p_branch_id
          and br.business_id = v_business_id
          and br.active = true
    ) then
        raise exception
            'La sucursal no existe, está inactiva o no pertenece a tu negocio';
    end if;


    -- =====================================================
    -- VALIDAR SESIÓN DE CAJA EXACTA
    -- =====================================================

    if p_cash_session_id is null then
        raise exception
            'La sesión de caja es obligatoria';
    end if;

    if not exists (
        select 1
        from public.cash_sessions cs
        where cs.id = p_cash_session_id
          and cs.business_id = v_business_id
          and cs.branch_id = p_branch_id
          and cs.status = 'open'
    ) then
        raise exception
            'La sesión de caja no existe, no pertenece a esta sucursal o ya está cerrada';
    end if;


    -- =====================================================
    -- VALIDAR FECHA ORIGINAL
    -- =====================================================

    if p_created_at is null then
        raise exception
            'La fecha original de la venta es obligatoria';
    end if;


    -- =====================================================
    -- VALIDAR CARRITO
    -- =====================================================

    if p_items is null
       or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) = 0 then
        raise exception 'El carrito está vacío';
    end if;


    -- =====================================================
    -- VALIDAR MÉTODO DE PAGO
    -- =====================================================

    if p_payment_method not in ('cash', 'card', 'transfer') then
        raise exception
            'Método de pago no válido';
    end if;


    -- =====================================================
    -- GENERAR NÚMERO DE VENTA
    -- =====================================================

    v_number :=
        'V-' ||
        to_char(p_created_at, 'YYYYMMDD-HH24MISS') ||
        '-' ||
        lpad(floor(random() * 1000)::text, 3, '0');


    -- =====================================================
    -- CREAR VENTA
    -- =====================================================

    insert into public.sales (
        id,
        number,
        subtotal,
        discount,
        total,
        paid_amount,
        change_due,
        cash_session_id,
        payment_method,
        user_id,
        business_id,
        branch_id,
        created_at,
        updated_at
    )
    values (
        p_sale_id,
        v_number,
        0,
        0,
        0,
        0,
        0,
        p_cash_session_id,
        p_payment_method,
        auth.uid(),
        v_business_id,
        p_branch_id,
        p_created_at,
        now()
    );


    -- =====================================================
    -- PROCESAR PRODUCTOS
    -- =====================================================

    for v_item in
        select value
        from jsonb_array_elements(p_items)
    loop

        v_quantity :=
            (v_item->>'quantity')::numeric;

        if v_quantity is null or v_quantity <= 0 then
            raise exception 'Cantidad inválida';
        end if;

        if v_quantity <> round(v_quantity, 3) then
            raise exception
                'La cantidad no puede tener más de 3 decimales';
        end if;


        select *
        into v_product
        from public.products
        where id = (v_item->>'product_id')::uuid
          and business_id = v_business_id;

        if not found then
            raise exception
                'Producto no encontrado o no pertenece a tu negocio';
        end if;


        if v_product.sale_unit = 'piece'
           and v_quantity <> trunc(v_quantity) then
            raise exception
                'El producto "%" se vende por pieza y requiere una cantidad entera',
                v_product.name;
        end if;


        select bi.stock
        into v_stock_before
        from public.branch_inventory bi
        where bi.business_id = v_business_id
          and bi.branch_id = p_branch_id
          and bi.product_id = v_product.id
        for update;

        if not found then
            raise exception
                'El producto % no tiene inventario asignado en esta sucursal',
                v_product.name;
        end if;


        if v_stock_before < v_quantity then
            raise exception
                'Stock insuficiente para % en esta sucursal. Disponible: %, solicitado: %',
                v_product.name,
                v_stock_before,
                v_quantity;
        end if;


        v_stock_after :=
            v_stock_before - v_quantity;

        v_subtotal :=
            v_subtotal +
            (v_product.sale_price * v_quantity);


        if nullif(v_item->>'sale_item_id', '') is null then
            raise exception
                'Cada artículo debe incluir sale_item_id';
        end if;


        insert into public.sale_items (
            id,
            sale_id,
            product_id,
            name,
            unit_price,
            unit_cost,
            quantity,
            subtotal,
            business_id,
            created_at
        )
        values (
            (v_item->>'sale_item_id')::uuid,
            p_sale_id,
            v_product.id,
            v_product.name,
            v_product.sale_price,
            v_product.cost_price,
            v_quantity,
            v_product.sale_price * v_quantity,
            v_business_id,
            p_created_at
        );


        update public.branch_inventory
        set
            stock = v_stock_after,
            updated_at = now()
        where business_id = v_business_id
          and branch_id = p_branch_id
          and product_id = v_product.id;


        insert into public.inventory_movements (
            product_id,
            movement_type,
            quantity,
            stock_before,
            stock_after,
            reference_id,
            note,
            user_id,
            business_id,
            branch_id,
            created_at
        )
        values (
            v_product.id,
            'sale',
            -v_quantity,
            v_stock_before,
            v_stock_after,
            null,
            'Venta ' || v_number,
            auth.uid(),
            v_business_id,
            p_branch_id,
            p_created_at
        );

    end loop;


    -- =====================================================
    -- TOTAL
    -- =====================================================

    v_total := v_subtotal;


    -- =====================================================
    -- PAGO
    -- =====================================================

    if p_payment_method = 'cash' then

        if p_paid_amount is null
           or p_paid_amount < v_total then
            raise exception
                'Efectivo insuficiente. Total: %, recibido: %',
                v_total,
                coalesce(p_paid_amount, 0);
        end if;

        v_paid_amount := p_paid_amount;
        v_change_due :=
            p_paid_amount - v_total;

    elsif p_payment_method in ('card', 'transfer') then

        v_paid_amount := v_total;
        v_change_due := 0;

    end if;


    -- =====================================================
    -- FINALIZAR VENTA
    -- =====================================================

    update public.sales
    set
        subtotal = v_subtotal,
        total = v_total,
        paid_amount = v_paid_amount,
        change_due = v_change_due,
        payment_method = p_payment_method,
        updated_at = now()
    where id = p_sale_id
      and business_id = v_business_id
      and branch_id = p_branch_id;


    return jsonb_build_object(
        'sale_id', p_sale_id,
        'number', v_number,
        'cash_session_id', p_cash_session_id,
        'branch_id', p_branch_id,
        'subtotal', v_subtotal,
        'total', v_total,
        'paid_amount', v_paid_amount,
        'change_due', v_change_due,
        'payment_method', p_payment_method,
        'created_at', p_created_at,
        'already_synced', false
    );

end;
$$;


--
-- Name: track_product_price_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_product_price_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
    v_version integer;
    v_timestamp timestamptz := statement_timestamp();
BEGIN
    IF NEW.sale_price IS NOT DISTINCT FROM OLD.sale_price THEN
        RETURN NEW;
    END IF;

    SELECT version
    INTO v_version
    FROM public.product_price_versions
    WHERE product_id = OLD.id
      AND valid_until IS NULL
    FOR UPDATE;

    IF v_version IS NULL THEN
        RAISE EXCEPTION
            'No existe un precio vigente para el producto %',
            OLD.id;
    END IF;

    UPDATE public.product_price_versions
    SET valid_until = v_timestamp
    WHERE product_id = OLD.id
      AND version = v_version;

    INSERT INTO public.product_price_versions (
        business_id,
        product_id,
        version,
        sale_price,
        valid_from
    )
    VALUES (
        NEW.business_id,
        NEW.id,
        v_version + 1,
        NEW.sale_price,
        v_timestamp
    );

    RETURN NEW;
END;
$$;


--
-- Name: update_employee_role(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_employee_role(p_employee_id uuid, p_role text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.has_role(array['admin']) then
    raise exception 'Solo un administrador puede cambiar roles';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  -- La suscripción debe permitir operaciones
  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite administrar usuarios';
  end if;

  if p_employee_id is null then
    raise exception 'Empleado no válido';
  end if;

  if p_role is null
     or p_role not in ('admin', 'manager', 'cashier') then
    raise exception 'Rol no válido';
  end if;

  if p_employee_id = auth.uid() then
    raise exception 'No puedes cambiar tu propio rol';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_employee_id
      and business_id = v_business_id
  ) then
    raise exception 'Empleado no encontrado o no pertenece a tu negocio';
  end if;

  update public.profiles
  set
    role = p_role,
    updated_at = now()
  where id = p_employee_id
    and business_id = v_business_id;
end;
$$;


--
-- Name: update_product(uuid, text, text, numeric, numeric, numeric, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_product(p_product_id uuid, p_name text, p_barcode text DEFAULT NULL::text, p_cost_price numeric DEFAULT 0, p_sale_price numeric DEFAULT 0, p_minimum_stock numeric DEFAULT 0, p_branch_id uuid DEFAULT NULL::uuid, p_sale_unit text DEFAULT 'piece'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_business_id uuid;
begin

  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.has_role(array['admin', 'manager']) then
    raise exception 'No tienes permisos para editar productos';
  end if;

  v_business_id := public.current_business_id();

  if v_business_id is null then
    raise exception 'No se pudo determinar el negocio del usuario';
  end if;

  if not public.has_operational_subscription() then
    raise exception
      'La suscripción del negocio no permite editar productos';
  end if;

  if p_branch_id is null then
    raise exception 'La sucursal es obligatoria';
  end if;

  if not public.has_branch_access(p_branch_id) then
    raise exception 'No tienes acceso a esta sucursal';
  end if;

  if not exists (
    select 1
    from public.branches br
    where br.id = p_branch_id
      and br.business_id = v_business_id
      and br.active = true
  ) then
    raise exception
      'La sucursal no existe, está inactiva o no pertenece a tu negocio';
  end if;

  if not exists (
    select 1
    from public.products p
    where p.id = p_product_id
      and p.business_id = v_business_id
  ) then
    raise exception 'El producto no pertenece a tu negocio';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'El nombre del producto es obligatorio';
  end if;

  if p_cost_price is null or p_cost_price < 0 then
    raise exception 'El costo no puede ser negativo';
  end if;

  if p_sale_price is null or p_sale_price < 0 then
    raise exception 'El precio de venta no puede ser negativo';
  end if;

  if p_minimum_stock is null or p_minimum_stock < 0 then
    raise exception 'El stock mínimo no puede ser negativo';
  end if;

  if p_sale_unit is null
     or p_sale_unit not in ('piece', 'kg') then
    raise exception 'Unidad de venta no válida';
  end if;

  -- Datos globales del producto.
  update public.products
  set
    name = trim(p_name),
    barcode = nullif(trim(p_barcode), ''),
    cost_price = p_cost_price,
    sale_price = p_sale_price,
    sale_unit = p_sale_unit,
    updated_at = now()
  where id = p_product_id
    and business_id = v_business_id;

  -- Configuración de inventario exclusiva de la sucursal.
  update public.branch_inventory
  set
    minimum_stock = p_minimum_stock,
    updated_at = now()
  where business_id = v_business_id
    and branch_id = p_branch_id
    and product_id = p_product_id;

  if not found then
    raise exception
      'No existe inventario para este producto en la sucursal seleccionada';
  end if;

  return jsonb_build_object(
    'product_id', p_product_id,
    'branch_id', p_branch_id,
    'name', trim(p_name),
    'barcode', nullif(trim(p_barcode), ''),
    'cost_price', p_cost_price,
    'sale_price', p_sale_price,
    'sale_unit', p_sale_unit,
    'minimum_stock', p_minimum_stock
  );

end;
$$;


--
-- Name: verify_pos_device_pairing_resolution(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_pos_device_pairing_resolution(p_challenge_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_device_id uuid;
  v_token public.pos_device_pairing_tokens%ROWTYPE;
  v_device public.pos_devices%ROWTYPE;
  v_challenge public.pos_device_pairing_challenges%ROWTYPE;
BEGIN
  IF p_challenge_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT t.device_id
  INTO v_device_id
  FROM public.pos_device_pairing_challenges c
  JOIN public.pos_device_pairing_tokens t
    ON t.id = c.pairing_token_id
  WHERE c.id = p_challenge_id;

  IF v_device_id IS NULL THEN
    RETURN false;
  END IF;

  -- Coordinar con la confirmación original.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pos-device-pairing:' || v_device_id::text,
      0
    )
  );

  -- Respetar el orden de bloqueo existente:
  -- token, dispositivo, desafío.

  SELECT t.*
  INTO v_token
  FROM public.pos_device_pairing_tokens t
  JOIN public.pos_device_pairing_challenges c
    ON c.pairing_token_id = t.id
  WHERE c.id = p_challenge_id
  FOR UPDATE OF t;

  IF NOT FOUND
     OR v_token.device_id IS DISTINCT FROM v_device_id
  THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_device
  FROM public.pos_devices
  WHERE id = v_token.device_id
    AND business_id = v_token.business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_challenge
  FROM public.pos_device_pairing_challenges
  WHERE id = p_challenge_id
    AND pairing_token_id = v_token.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Rechazar dispositivos vinculados, revocados
  -- o con identidad parcialmente registrada.
  IF v_device.status IS DISTINCT FROM 'active'
     OR v_device.revoked_at IS NOT NULL
     OR v_device.linked_at IS NOT NULL
     OR v_device.public_key IS NOT NULL
  THEN
    RETURN false;
  END IF;

  -- La finalización original debe haber
  -- consumido el token y el desafío.
  IF v_token.used_at IS NULL
     OR v_challenge.used_at IS NULL
  THEN
    RETURN false;
  END IF;

  -- Exigir el registro persistente creado
  -- por la transacción de finalización.
  RETURN EXISTS (
    SELECT 1
    FROM public.pos_device_pairing_resolutions r
    WHERE r.pairing_challenge_id = p_challenge_id
      AND r.device_id = v_device_id
  );
END;
$$;


--
-- Name: branch_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    product_id uuid NOT NULL,
    stock numeric(12,3) DEFAULT 0 NOT NULL,
    minimum_stock numeric(12,3) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT branch_inventory_minimum_stock_nonnegative CHECK ((minimum_stock >= (0)::numeric)),
    CONSTRAINT branch_inventory_stock_nonnegative CHECK ((stock >= (0)::numeric))
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    code text,
    active boolean DEFAULT true NOT NULL,
    is_main boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: business_payment_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_payment_settings (
    business_id uuid NOT NULL,
    bank_name text,
    account_holder text,
    clabe text,
    account_number text,
    transfer_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_payment_settings_clabe_check CHECK (((clabe IS NULL) OR (clabe ~ '^[0-9]{18}$'::text)))
);


--
-- Name: businesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.businesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    timezone text DEFAULT 'America/Mexico_City'::text NOT NULL
);


--
-- Name: demo_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: device_catalog_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_catalog_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    catalog_sync_id uuid NOT NULL,
    business_id uuid NOT NULL,
    product_id uuid NOT NULL,
    price_version_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: device_catalog_syncs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_catalog_syncs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_id uuid NOT NULL,
    business_id uuid NOT NULL,
    synced_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    movement_type text NOT NULL,
    quantity numeric(12,3) NOT NULL,
    stock_before numeric(12,3) NOT NULL,
    stock_after numeric(12,3) NOT NULL,
    reference_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    CONSTRAINT inventory_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['purchase'::text, 'stock_in'::text, 'sale'::text, 'adjustment'::text, 'return'::text, 'purchase_cancel'::text, 'transfer_out'::text, 'transfer_in'::text, 'transfer_cancel'::text])))
);


--
-- Name: inventory_transfer_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_transfer_items (
    transfer_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    sale_unit text NOT NULL,
    quantity numeric NOT NULL,
    CONSTRAINT inventory_transfer_items_quantity_check CHECK (((quantity > (0)::numeric) AND ((quantity)::text <> ALL (ARRAY['NaN'::text, 'Infinity'::text, '-Infinity'::text]))))
);


--
-- Name: inventory_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_transfers (
    id uuid NOT NULL,
    business_id uuid NOT NULL,
    source_branch_id uuid NOT NULL,
    destination_branch_id uuid NOT NULL,
    status text DEFAULT 'in_transit'::text NOT NULL,
    note text,
    sent_by uuid,
    received_by uuid,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    received_at timestamp with time zone,
    request_items jsonb NOT NULL,
    CONSTRAINT inventory_transfers_different_branches CHECK ((source_branch_id <> destination_branch_id)),
    CONSTRAINT inventory_transfers_received_state CHECK ((((status = 'in_transit'::text) AND (received_at IS NULL) AND (received_by IS NULL)) OR ((status = 'received'::text) AND (received_at IS NOT NULL)) OR ((status = 'cancelled'::text) AND (received_at IS NULL) AND (received_by IS NULL)))),
    CONSTRAINT inventory_transfers_status_check CHECK ((status = ANY (ARRAY['in_transit'::text, 'received'::text, 'cancelled'::text])))
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    negocio text NOT NULL,
    whatsapp text NOT NULL,
    email text NOT NULL,
    comentarios text,
    estado text DEFAULT 'nuevo'::text NOT NULL,
    origen text DEFAULT 'formulario'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mercadopago_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mercadopago_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    mercadopago_user_id text NOT NULL,
    access_token text NOT NULL,
    refresh_token text,
    token_type text,
    scope text,
    expires_at timestamp with time zone,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    max_users integer NOT NULL,
    max_products integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    price_monthly numeric(12,2),
    currency text DEFAULT 'MXN'::text NOT NULL,
    mercadopago_plan_id text,
    max_branches integer DEFAULT 1 NOT NULL,
    CONSTRAINT plans_max_products_check CHECK ((max_products > 0)),
    CONSTRAINT plans_max_users_check CHECK ((max_users > 0))
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_device_auth_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_device_auth_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_id uuid NOT NULL,
    challenge_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    CONSTRAINT pos_device_auth_challenge_expiry_check CHECK ((expires_at > created_at)),
    CONSTRAINT pos_device_auth_challenge_hash_check CHECK ((challenge_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: pos_device_pairing_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_device_pairing_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pairing_token_hash text NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    successful boolean DEFAULT false NOT NULL
);


--
-- Name: pos_device_pairing_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_device_pairing_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pairing_token_id uuid NOT NULL,
    challenge_hash text NOT NULL,
    public_key text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pairing_challenge_expiry_check CHECK ((expires_at > created_at)),
    CONSTRAINT pairing_challenge_public_key_check CHECK ((length(btrim(public_key)) > 0))
);


--
-- Name: pos_device_pairing_resolutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_device_pairing_resolutions (
    pairing_challenge_id uuid NOT NULL,
    device_id uuid NOT NULL,
    finalized_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- Name: pos_device_pairing_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_device_pairing_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_id uuid NOT NULL,
    business_id uuid NOT NULL,
    created_by uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pairing_token_expiry_check CHECK ((expires_at > created_at))
);


--
-- Name: pos_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    registered_by uuid NOT NULL,
    name text NOT NULL,
    platform text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sync_at timestamp with time zone,
    revoked_at timestamp with time zone,
    public_key text,
    linked_at timestamp with time zone,
    offline_authorized_until timestamp with time zone,
    last_verified_at timestamp with time zone,
    CONSTRAINT pos_devices_linked_key_check CHECK ((((public_key IS NULL) AND (linked_at IS NULL)) OR ((public_key IS NOT NULL) AND (linked_at IS NOT NULL)))),
    CONSTRAINT pos_devices_name_check CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT pos_devices_platform_check CHECK ((platform = ANY (ARRAY['android'::text, 'ios'::text]))),
    CONSTRAINT pos_devices_public_key_not_empty_check CHECK (((public_key IS NULL) OR (length(btrim(public_key)) > 0))),
    CONSTRAINT pos_devices_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);


--
-- Name: pos_mobile_cash_session_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_mobile_cash_session_links (
    device_id uuid NOT NULL,
    local_session_id text NOT NULL,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    cash_session_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mobile_local_session_id_valid CHECK (((length(local_session_id) >= 1) AND (length(local_session_id) <= 128)))
);


--
-- Name: pos_mobile_inventory_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_mobile_inventory_reconciliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    device_id uuid NOT NULL,
    product_id uuid NOT NULL,
    local_product_id text NOT NULL,
    local_change_id text NOT NULL,
    movement_type text NOT NULL,
    previous_stock numeric(15,3) NOT NULL,
    requested_stock numeric(15,3) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    decision text,
    corrected_stock numeric(15,3),
    reason text,
    server_stock_at_review numeric(15,3),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    applied_at timestamp with time zone,
    CONSTRAINT pos_mobile_inventory_reconciliations_corrected_stock_check CHECK (((corrected_stock IS NULL) OR ((corrected_stock >= (0)::numeric) AND (corrected_stock < (1000000000)::numeric)))),
    CONSTRAINT pos_mobile_inventory_reconciliations_decision_check CHECK (((decision IS NULL) OR (decision = ANY (ARRAY['keep_server'::text, 'accept_count'::text, 'corrected_count'::text])))),
    CONSTRAINT pos_mobile_inventory_reconciliations_movement_type_check CHECK ((movement_type = ANY (ARRAY['count'::text, 'legacy'::text]))),
    CONSTRAINT pos_mobile_inventory_reconciliations_previous_stock_check CHECK (((previous_stock >= (0)::numeric) AND (previous_stock < (1000000000)::numeric))),
    CONSTRAINT pos_mobile_inventory_reconciliations_requested_stock_check CHECK (((requested_stock >= (0)::numeric) AND (requested_stock < (1000000000)::numeric))),
    CONSTRAINT pos_mobile_inventory_reconciliations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'applied'::text]))),
    CONSTRAINT reconciliation_local_ids_valid CHECK ((((length(btrim(local_product_id)) >= 1) AND (length(btrim(local_product_id)) <= 128)) AND ((length(btrim(local_change_id)) >= 1) AND (length(btrim(local_change_id)) <= 128)))),
    CONSTRAINT reconciliation_review_consistency CHECK ((((status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (decision IS NULL) AND (corrected_stock IS NULL) AND (reason IS NULL) AND (applied_at IS NULL)) OR ((status = 'rejected'::text) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (decision IS NULL) AND (corrected_stock IS NULL) AND (reason IS NOT NULL) AND (length(btrim(reason)) >= 10) AND (applied_at IS NULL)) OR ((status = ANY (ARRAY['approved'::text, 'applied'::text])) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (decision = ANY (ARRAY['keep_server'::text, 'accept_count'::text, 'corrected_count'::text])) AND (reason IS NOT NULL) AND (length(btrim(reason)) >= 10) AND (((decision = 'corrected_count'::text) AND (corrected_stock IS NOT NULL)) OR ((decision <> 'corrected_count'::text) AND (corrected_stock IS NULL))) AND (((status = 'approved'::text) AND (applied_at IS NULL)) OR ((status = 'applied'::text) AND (applied_at IS NOT NULL))))))
);


--
-- Name: pos_mobile_product_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_mobile_product_links (
    device_id uuid NOT NULL,
    local_product_id text NOT NULL,
    business_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mobile_local_product_id_valid CHECK (((length(local_product_id) >= 1) AND (length(local_product_id) <= 128)))
);


--
-- Name: pos_mobile_sync_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_mobile_sync_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_id uuid NOT NULL,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    local_operation_id text NOT NULL,
    operation_type text NOT NULL,
    status text DEFAULT 'processing'::text NOT NULL,
    server_record_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    request_payload jsonb,
    CONSTRAINT pos_mobile_sync_operations_operation_type_check CHECK ((operation_type = ANY (ARRAY['product'::text, 'sale'::text, 'inventory'::text, 'cash_open'::text, 'cash_movement'::text, 'cash_close'::text]))),
    CONSTRAINT pos_mobile_sync_operations_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'completed'::text])))
);


--
-- Name: product_price_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_price_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    product_id uuid NOT NULL,
    version integer NOT NULL,
    sale_price numeric(12,2) NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_price_versions_dates_check CHECK (((valid_until IS NULL) OR (valid_until >= valid_from))),
    CONSTRAINT product_price_versions_sale_price_check CHECK ((sale_price >= (0)::numeric)),
    CONSTRAINT product_price_versions_version_check CHECK ((version > 0))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    barcode text,
    cost_price numeric(12,2) DEFAULT 0 NOT NULL,
    sale_price numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_id uuid NOT NULL,
    sale_unit text DEFAULT 'piece'::text NOT NULL,
    CONSTRAINT products_sale_unit_check CHECK ((sale_unit = ANY (ARRAY['piece'::text, 'kg'::text, 'g'::text, 'liter'::text, 'meter'::text])))
);


--
-- Name: profile_branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_branches (
    profile_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    role text DEFAULT 'cashier'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_id uuid NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'cashier'::text])))
);


--
-- Name: purchase_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_id uuid NOT NULL,
    product_id uuid,
    name text NOT NULL,
    quantity numeric(12,3) NOT NULL,
    unit_cost numeric(12,2) NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    business_id uuid NOT NULL,
    CONSTRAINT purchase_items_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT purchase_items_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT purchase_items_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: purchase_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_return_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_return_id uuid NOT NULL,
    purchase_item_id uuid NOT NULL,
    product_id uuid,
    name text NOT NULL,
    quantity numeric(12,3) NOT NULL,
    unit_cost numeric(12,2) NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    business_id uuid NOT NULL,
    CONSTRAINT purchase_return_items_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT purchase_return_items_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT purchase_return_items_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: purchase_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_returns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    number text NOT NULL,
    purchase_id uuid NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    CONSTRAINT purchase_returns_total_check CHECK ((total >= (0)::numeric))
);


--
-- Name: purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    number text NOT NULL,
    supplier_id uuid,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    cancelled_by uuid,
    cancelled_at timestamp with time zone,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    CONSTRAINT purchases_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'cancelled'::text])))
);


--
-- Name: sale_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    product_id uuid,
    name text NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    unit_cost numeric(12,2) DEFAULT 0 NOT NULL,
    quantity numeric(12,3) NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    business_id uuid NOT NULL
);


--
-- Name: sale_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_return_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_id uuid NOT NULL,
    sale_item_id uuid NOT NULL,
    product_id uuid,
    product_name text NOT NULL,
    quantity numeric NOT NULL,
    unit_price numeric NOT NULL,
    subtotal numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sale_return_items_quantity_check CHECK (((quantity > (0)::numeric) AND (quantity <> 'NaN'::numeric) AND (quantity <> 'Infinity'::numeric) AND (quantity <> '-Infinity'::numeric))),
    CONSTRAINT sale_return_items_subtotal_check CHECK (((subtotal >= (0)::numeric) AND (subtotal <> 'NaN'::numeric) AND (subtotal <> 'Infinity'::numeric) AND (subtotal <> '-Infinity'::numeric))),
    CONSTRAINT sale_return_items_unit_price_check CHECK (((unit_price >= (0)::numeric) AND (unit_price <> 'NaN'::numeric) AND (unit_price <> 'Infinity'::numeric) AND (unit_price <> '-Infinity'::numeric)))
);


--
-- Name: sale_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_returns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    sale_id uuid NOT NULL,
    cash_session_id uuid,
    refund_method text NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    reason text,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    request_id uuid,
    CONSTRAINT sale_returns_refund_method_check CHECK ((refund_method = ANY (ARRAY['cash'::text, 'card'::text, 'transfer'::text]))),
    CONSTRAINT sale_returns_total_check CHECK (((total >= (0)::numeric) AND (total <> 'NaN'::numeric) AND (total <> 'Infinity'::numeric) AND (total <> '-Infinity'::numeric)))
);


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    discount numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    paid_amount numeric(12,2) DEFAULT 0 NOT NULL,
    change_due numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    number text,
    cash_session_id uuid,
    payment_method text DEFAULT 'cash'::text NOT NULL,
    user_id uuid,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    client_operation_id uuid,
    origin text DEFAULT 'web'::text NOT NULL,
    CONSTRAINT sales_origin_check CHECK ((origin = ANY (ARRAY['web'::text, 'offline_sync'::text]))),
    CONSTRAINT sales_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'transfer'::text])))
);


--
-- Name: subscription_checkouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_checkouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    mercadopago_subscription_id text,
    mercadopago_status text DEFAULT 'pending'::text NOT NULL,
    payer_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    trial_ends_at timestamp with time zone,
    current_period_ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    mercadopago_subscription_id text,
    mercadopago_plan_id text,
    mercadopago_payer_email text,
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'cancelled'::text])))
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_id uuid NOT NULL
);


--
-- Name: branch_inventory branch_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_inventory
    ADD CONSTRAINT branch_inventory_pkey PRIMARY KEY (id);


--
-- Name: branch_inventory branch_inventory_unique_product; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_inventory
    ADD CONSTRAINT branch_inventory_unique_product UNIQUE (branch_id, product_id);


--
-- Name: branches branches_id_business_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_id_business_unique UNIQUE (id, business_id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: business_payment_settings business_payment_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_payment_settings
    ADD CONSTRAINT business_payment_settings_pkey PRIMARY KEY (business_id);


--
-- Name: businesses businesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_pkey PRIMARY KEY (id);


--
-- Name: businesses businesses_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_slug_key UNIQUE (slug);


--
-- Name: cash_movements cash_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_pkey PRIMARY KEY (id);


--
-- Name: cash_sessions cash_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_sessions
    ADD CONSTRAINT cash_sessions_pkey PRIMARY KEY (id);


--
-- Name: demo_requests demo_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_requests
    ADD CONSTRAINT demo_requests_pkey PRIMARY KEY (id);


--
-- Name: device_catalog_prices device_catalog_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_catalog_prices
    ADD CONSTRAINT device_catalog_prices_pkey PRIMARY KEY (id);


--
-- Name: device_catalog_prices device_catalog_prices_product_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_catalog_prices
    ADD CONSTRAINT device_catalog_prices_product_unique UNIQUE (catalog_sync_id, product_id);


--
-- Name: device_catalog_syncs device_catalog_syncs_id_business_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_catalog_syncs
    ADD CONSTRAINT device_catalog_syncs_id_business_unique UNIQUE (id, business_id);


--
-- Name: device_catalog_syncs device_catalog_syncs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_catalog_syncs
    ADD CONSTRAINT device_catalog_syncs_pkey PRIMARY KEY (id);


--
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);


--
-- Name: inventory_transfer_items inventory_transfer_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfer_items
    ADD CONSTRAINT inventory_transfer_items_pkey PRIMARY KEY (transfer_id, product_id);


--
-- Name: inventory_transfers inventory_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfers
    ADD CONSTRAINT inventory_transfers_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: mercadopago_connections mercadopago_connections_business_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mercadopago_connections
    ADD CONSTRAINT mercadopago_connections_business_unique UNIQUE (business_id);


--
-- Name: mercadopago_connections mercadopago_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mercadopago_connections
    ADD CONSTRAINT mercadopago_connections_pkey PRIMARY KEY (id);


--
-- Name: offline_sale_conflicts offline_sale_conflicts_business_sale_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_sale_conflicts
    ADD CONSTRAINT offline_sale_conflicts_business_sale_unique UNIQUE (business_id, sale_id);


--
-- Name: offline_sale_conflicts offline_sale_conflicts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_sale_conflicts
    ADD CONSTRAINT offline_sale_conflicts_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: plans plans_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_slug_key UNIQUE (slug);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);


--
-- Name: pos_device_auth_challenges pos_device_auth_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_auth_challenges
    ADD CONSTRAINT pos_device_auth_challenges_pkey PRIMARY KEY (id);


--
-- Name: pos_device_pairing_attempts pos_device_pairing_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_pairing_attempts
    ADD CONSTRAINT pos_device_pairing_attempts_pkey PRIMARY KEY (id);


--
-- Name: pos_device_pairing_challenges pos_device_pairing_challenges_challenge_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_pairing_challenges
    ADD CONSTRAINT pos_device_pairing_challenges_challenge_hash_key UNIQUE (challenge_hash);


--
-- Name: pos_device_pairing_challenges pos_device_pairing_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_pairing_challenges
    ADD CONSTRAINT pos_device_pairing_challenges_pkey PRIMARY KEY (id);


--
-- Name: pos_device_pairing_resolutions pos_device_pairing_resolutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_pairing_resolutions
    ADD CONSTRAINT pos_device_pairing_resolutions_pkey PRIMARY KEY (pairing_challenge_id);


--
-- Name: pos_device_pairing_tokens pos_device_pairing_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_pairing_tokens
    ADD CONSTRAINT pos_device_pairing_tokens_pkey PRIMARY KEY (id);


--
-- Name: pos_device_pairing_tokens pos_device_pairing_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_pairing_tokens
    ADD CONSTRAINT pos_device_pairing_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: pos_devices pos_devices_id_business_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_devices
    ADD CONSTRAINT pos_devices_id_business_unique UNIQUE (id, business_id);


--
-- Name: pos_devices pos_devices_identity_branch_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_devices
    ADD CONSTRAINT pos_devices_identity_branch_unique UNIQUE (id, business_id, branch_id);


--
-- Name: pos_devices pos_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_devices
    ADD CONSTRAINT pos_devices_pkey PRIMARY KEY (id);


--
-- Name: pos_mobile_cash_session_links pos_mobile_cash_session_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_cash_session_links
    ADD CONSTRAINT pos_mobile_cash_session_links_pkey PRIMARY KEY (device_id, local_session_id);


--
-- Name: pos_mobile_inventory_reconciliations pos_mobile_inventory_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_inventory_reconciliations
    ADD CONSTRAINT pos_mobile_inventory_reconciliations_pkey PRIMARY KEY (id);


--
-- Name: pos_mobile_product_links pos_mobile_product_links_identity_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_product_links
    ADD CONSTRAINT pos_mobile_product_links_identity_unique UNIQUE (device_id, business_id, product_id, local_product_id);


--
-- Name: pos_mobile_product_links pos_mobile_product_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_product_links
    ADD CONSTRAINT pos_mobile_product_links_pkey PRIMARY KEY (device_id, local_product_id);


--
-- Name: pos_mobile_sync_operations pos_mobile_sync_operations_device_id_local_operation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_sync_operations
    ADD CONSTRAINT pos_mobile_sync_operations_device_id_local_operation_id_key UNIQUE (device_id, local_operation_id);


--
-- Name: pos_mobile_sync_operations pos_mobile_sync_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_sync_operations
    ADD CONSTRAINT pos_mobile_sync_operations_pkey PRIMARY KEY (id);


--
-- Name: product_price_versions product_price_versions_id_product_business_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_price_versions
    ADD CONSTRAINT product_price_versions_id_product_business_unique UNIQUE (id, product_id, business_id);


--
-- Name: product_price_versions product_price_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_price_versions
    ADD CONSTRAINT product_price_versions_pkey PRIMARY KEY (id);


--
-- Name: product_price_versions product_price_versions_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_price_versions
    ADD CONSTRAINT product_price_versions_unique UNIQUE (product_id, version);


--
-- Name: products products_id_business_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_id_business_unique UNIQUE (id, business_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profile_branches profile_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_branches
    ADD CONSTRAINT profile_branches_pkey PRIMARY KEY (profile_id, branch_id);


--
-- Name: profiles profiles_id_business_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_business_unique UNIQUE (id, business_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: purchase_items purchase_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_return_items purchase_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_returns purchase_returns_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_number_key UNIQUE (number);


--
-- Name: purchase_returns purchase_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_number_key UNIQUE (number);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: pos_mobile_inventory_reconciliations reconciliation_unique_local_change; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_inventory_reconciliations
    ADD CONSTRAINT reconciliation_unique_local_change UNIQUE (device_id, local_change_id);


--
-- Name: sale_items sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);


--
-- Name: sale_return_items sale_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_pkey PRIMARY KEY (id);


--
-- Name: sale_return_items sale_return_items_return_sale_item_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_return_sale_item_unique UNIQUE (return_id, sale_item_id);


--
-- Name: sale_returns sale_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_pkey PRIMARY KEY (id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: subscription_checkouts subscription_checkouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_checkouts
    ADD CONSTRAINT subscription_checkouts_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_business_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_business_id_key UNIQUE (business_id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: branch_inventory_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX branch_inventory_branch_id_idx ON public.branch_inventory USING btree (branch_id);


--
-- Name: branch_inventory_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX branch_inventory_business_id_idx ON public.branch_inventory USING btree (business_id);


--
-- Name: branch_inventory_product_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX branch_inventory_product_id_idx ON public.branch_inventory USING btree (product_id);


--
-- Name: branches_business_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branches_business_code_idx ON public.branches USING btree (business_id, code) WHERE (code IS NOT NULL);


--
-- Name: branches_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX branches_business_id_idx ON public.branches USING btree (business_id);


--
-- Name: branches_one_main_per_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branches_one_main_per_business_idx ON public.branches USING btree (business_id) WHERE (is_main = true);


--
-- Name: cash_movements_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_movements_branch_id_idx ON public.cash_movements USING btree (branch_id);


--
-- Name: cash_movements_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_movements_business_id_idx ON public.cash_movements USING btree (business_id);


--
-- Name: cash_movements_business_reference_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cash_movements_business_reference_uidx ON public.cash_movements USING btree (business_id, reference_id) WHERE (reference_id IS NOT NULL);


--
-- Name: cash_movements_cash_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_movements_cash_session_id_idx ON public.cash_movements USING btree (cash_session_id);


--
-- Name: cash_movements_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_movements_created_at_idx ON public.cash_movements USING btree (created_at);


--
-- Name: cash_movements_reference_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_movements_reference_id_idx ON public.cash_movements USING btree (reference_id);


--
-- Name: cash_movements_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_movements_user_id_idx ON public.cash_movements USING btree (user_id);


--
-- Name: cash_sessions_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_sessions_branch_id_idx ON public.cash_sessions USING btree (branch_id);


--
-- Name: cash_sessions_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_sessions_business_id_idx ON public.cash_sessions USING btree (business_id);


--
-- Name: cash_sessions_closed_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_sessions_closed_by_idx ON public.cash_sessions USING btree (closed_by);


--
-- Name: cash_sessions_one_open_per_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cash_sessions_one_open_per_branch_idx ON public.cash_sessions USING btree (branch_id) WHERE ((status = 'open'::text) AND (branch_id IS NOT NULL));


--
-- Name: cash_sessions_opened_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_sessions_opened_by_idx ON public.cash_sessions USING btree (opened_by);


--
-- Name: device_catalog_prices_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_catalog_prices_product_idx ON public.device_catalog_prices USING btree (product_id);


--
-- Name: device_catalog_syncs_device_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_catalog_syncs_device_idx ON public.device_catalog_syncs USING btree (device_id, created_at DESC);


--
-- Name: idx_mobile_cash_links_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mobile_cash_links_session ON public.pos_mobile_cash_session_links USING btree (cash_session_id);


--
-- Name: idx_mobile_product_links_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mobile_product_links_product ON public.pos_mobile_product_links USING btree (business_id, product_id);


--
-- Name: idx_mobile_reconciliations_business_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mobile_reconciliations_business_status ON public.pos_mobile_inventory_reconciliations USING btree (business_id, status, created_at DESC);


--
-- Name: idx_mobile_reconciliations_device; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mobile_reconciliations_device ON public.pos_mobile_inventory_reconciliations USING btree (device_id, created_at DESC);


--
-- Name: idx_pos_device_auth_challenges_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_device_auth_challenges_pending ON public.pos_device_auth_challenges USING btree (device_id, expires_at) WHERE (used_at IS NULL);


--
-- Name: idx_pos_mobile_sync_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_mobile_sync_business ON public.pos_mobile_sync_operations USING btree (business_id, branch_id, created_at);


--
-- Name: idx_sales_mobile_operation_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sales_mobile_operation_unique ON public.sales USING btree (business_id, client_operation_id) WHERE (client_operation_id IS NOT NULL);


--
-- Name: inventory_movements_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_movements_branch_id_idx ON public.inventory_movements USING btree (branch_id);


--
-- Name: inventory_movements_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_movements_business_id_idx ON public.inventory_movements USING btree (business_id);


--
-- Name: inventory_movements_reference_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_movements_reference_id_unique ON public.inventory_movements USING btree (reference_id) WHERE (reference_id IS NOT NULL);


--
-- Name: inventory_movements_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_movements_user_id_idx ON public.inventory_movements USING btree (user_id);


--
-- Name: inventory_transfers_destination_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_transfers_destination_idx ON public.inventory_transfers USING btree (business_id, destination_branch_id, status, sent_at DESC);


--
-- Name: inventory_transfers_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_transfers_source_idx ON public.inventory_transfers USING btree (business_id, source_branch_id, sent_at DESC);


--
-- Name: leads_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_created_at_idx ON public.leads USING btree (created_at DESC);


--
-- Name: leads_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_estado_idx ON public.leads USING btree (estado);


--
-- Name: mercadopago_connections_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mercadopago_connections_business_id_idx ON public.mercadopago_connections USING btree (business_id);


--
-- Name: offline_sale_conflicts_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_sale_conflicts_branch_idx ON public.offline_sale_conflicts USING btree (branch_id);


--
-- Name: offline_sale_conflicts_business_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_sale_conflicts_business_status_idx ON public.offline_sale_conflicts USING btree (business_id, status);


--
-- Name: plans_mp_plan_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plans_mp_plan_id_idx ON public.plans USING btree (mercadopago_plan_id) WHERE (mercadopago_plan_id IS NOT NULL);


--
-- Name: pos_device_pairing_attempts_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_device_pairing_attempts_lookup_idx ON public.pos_device_pairing_attempts USING btree (pairing_token_hash, attempted_at DESC);


--
-- Name: pos_device_pairing_challenges_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_device_pairing_challenges_token_idx ON public.pos_device_pairing_challenges USING btree (pairing_token_id);


--
-- Name: pos_device_pairing_one_pending_challenge_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pos_device_pairing_one_pending_challenge_idx ON public.pos_device_pairing_challenges USING btree (pairing_token_id) WHERE (used_at IS NULL);


--
-- Name: pos_device_pairing_one_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pos_device_pairing_one_pending_idx ON public.pos_device_pairing_tokens USING btree (device_id) WHERE (used_at IS NULL);


--
-- Name: pos_device_pairing_tokens_device_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_device_pairing_tokens_device_idx ON public.pos_device_pairing_tokens USING btree (device_id);


--
-- Name: pos_devices_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_devices_branch_idx ON public.pos_devices USING btree (branch_id);


--
-- Name: pos_devices_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_devices_business_idx ON public.pos_devices USING btree (business_id);


--
-- Name: product_price_versions_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_price_versions_business_idx ON public.product_price_versions USING btree (business_id);


--
-- Name: product_price_versions_one_current_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_price_versions_one_current_idx ON public.product_price_versions USING btree (product_id) WHERE (valid_until IS NULL);


--
-- Name: product_price_versions_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_price_versions_product_idx ON public.product_price_versions USING btree (product_id);


--
-- Name: products_business_barcode_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX products_business_barcode_unique ON public.products USING btree (business_id, barcode) WHERE (barcode IS NOT NULL);


--
-- Name: products_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_business_id_idx ON public.products USING btree (business_id);


--
-- Name: profile_branches_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_branches_branch_idx ON public.profile_branches USING btree (branch_id);


--
-- Name: profile_branches_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_branches_business_idx ON public.profile_branches USING btree (business_id);


--
-- Name: profile_branches_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_branches_profile_idx ON public.profile_branches USING btree (profile_id);


--
-- Name: profiles_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_business_id_idx ON public.profiles USING btree (business_id);


--
-- Name: purchase_items_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_items_business_id_idx ON public.purchase_items USING btree (business_id);


--
-- Name: purchase_items_product_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_items_product_id_idx ON public.purchase_items USING btree (product_id);


--
-- Name: purchase_items_purchase_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_items_purchase_id_idx ON public.purchase_items USING btree (purchase_id);


--
-- Name: purchase_return_items_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_return_items_business_id_idx ON public.purchase_return_items USING btree (business_id);


--
-- Name: purchase_return_items_product_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_return_items_product_id_idx ON public.purchase_return_items USING btree (product_id);


--
-- Name: purchase_return_items_purchase_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_return_items_purchase_item_id_idx ON public.purchase_return_items USING btree (purchase_item_id);


--
-- Name: purchase_return_items_return_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_return_items_return_id_idx ON public.purchase_return_items USING btree (purchase_return_id);


--
-- Name: purchase_returns_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_returns_branch_id_idx ON public.purchase_returns USING btree (branch_id);


--
-- Name: purchase_returns_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_returns_business_id_idx ON public.purchase_returns USING btree (business_id);


--
-- Name: purchase_returns_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_returns_created_at_idx ON public.purchase_returns USING btree (created_at);


--
-- Name: purchase_returns_purchase_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_returns_purchase_id_idx ON public.purchase_returns USING btree (purchase_id);


--
-- Name: purchase_returns_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_returns_user_id_idx ON public.purchase_returns USING btree (user_id);


--
-- Name: purchases_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchases_branch_id_idx ON public.purchases USING btree (branch_id);


--
-- Name: purchases_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchases_business_id_idx ON public.purchases USING btree (business_id);


--
-- Name: purchases_cancelled_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchases_cancelled_by_idx ON public.purchases USING btree (cancelled_by);


--
-- Name: purchases_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchases_created_at_idx ON public.purchases USING btree (created_at);


--
-- Name: purchases_supplier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchases_supplier_id_idx ON public.purchases USING btree (supplier_id);


--
-- Name: purchases_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchases_user_id_idx ON public.purchases USING btree (user_id);


--
-- Name: sale_items_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_items_business_id_idx ON public.sale_items USING btree (business_id);


--
-- Name: sale_items_product_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_items_product_id_idx ON public.sale_items USING btree (product_id);


--
-- Name: sale_items_sale_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_items_sale_id_idx ON public.sale_items USING btree (sale_id);


--
-- Name: sale_return_items_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_return_items_product_idx ON public.sale_return_items USING btree (product_id);


--
-- Name: sale_return_items_sale_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_return_items_sale_item_idx ON public.sale_return_items USING btree (sale_item_id);


--
-- Name: sale_returns_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_returns_branch_idx ON public.sale_returns USING btree (business_id, branch_id, created_at DESC);


--
-- Name: sale_returns_business_request_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sale_returns_business_request_id_unique ON public.sale_returns USING btree (business_id, request_id) WHERE (request_id IS NOT NULL);


--
-- Name: sale_returns_sale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_returns_sale_idx ON public.sale_returns USING btree (business_id, sale_id, created_at DESC);


--
-- Name: sales_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_branch_id_idx ON public.sales USING btree (branch_id);


--
-- Name: sales_business_client_operation_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sales_business_client_operation_uidx ON public.sales USING btree (business_id, client_operation_id) WHERE (client_operation_id IS NOT NULL);


--
-- Name: sales_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_business_id_idx ON public.sales USING btree (business_id);


--
-- Name: sales_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_created_at_idx ON public.sales USING btree (created_at);


--
-- Name: sales_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_user_id_idx ON public.sales USING btree (user_id);


--
-- Name: subscription_checkouts_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_checkouts_business_id_idx ON public.subscription_checkouts USING btree (business_id);


--
-- Name: subscription_checkouts_mp_subscription_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subscription_checkouts_mp_subscription_id_idx ON public.subscription_checkouts USING btree (mercadopago_subscription_id) WHERE (mercadopago_subscription_id IS NOT NULL);


--
-- Name: subscription_checkouts_pending_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_checkouts_pending_lookup_idx ON public.subscription_checkouts USING btree (business_id, requested_by, plan_id, mercadopago_status, created_at DESC);


--
-- Name: subscription_checkouts_plan_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_checkouts_plan_id_idx ON public.subscription_checkouts USING btree (plan_id);


--
-- Name: subscription_checkouts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_checkouts_status_idx ON public.subscription_checkouts USING btree (mercadopago_status);


--
-- Name: subscriptions_mp_subscription_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subscriptions_mp_subscription_id_idx ON public.subscriptions USING btree (mercadopago_subscription_id) WHERE (mercadopago_subscription_id IS NOT NULL);


--
-- Name: subscriptions_plan_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_plan_id_idx ON public.subscriptions USING btree (plan_id);


--
-- Name: subscriptions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_status_idx ON public.subscriptions USING btree (status);


--
-- Name: suppliers_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suppliers_business_id_idx ON public.suppliers USING btree (business_id);


--
-- Name: business_payment_settings set_business_payment_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_business_payment_settings_updated_at BEFORE UPDATE ON public.business_payment_settings FOR EACH ROW EXECUTE FUNCTION public.set_business_payment_settings_updated_at();


--
-- Name: inventory_movements set_inventory_movement_business_id_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_inventory_movement_business_id_trigger BEFORE INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.set_inventory_movement_business_id();


--
-- Name: products set_product_business_id_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_product_business_id_trigger BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_product_business_id();


--
-- Name: suppliers set_supplier_business_id_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_supplier_business_id_trigger BEFORE INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_supplier_business_id();


--
-- Name: products trg_track_product_price_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_track_product_price_change AFTER UPDATE OF sale_price ON public.products FOR EACH ROW WHEN ((old.sale_price IS DISTINCT FROM new.sale_price)) EXECUTE FUNCTION public.track_product_price_change();


--
-- Name: branch_inventory branch_inventory_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_inventory
    ADD CONSTRAINT branch_inventory_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: branch_inventory branch_inventory_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_inventory
    ADD CONSTRAINT branch_inventory_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: branch_inventory branch_inventory_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_inventory
    ADD CONSTRAINT branch_inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: branches branches_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: business_payment_settings business_payment_settings_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_payment_settings
    ADD CONSTRAINT business_payment_settings_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: cash_movements cash_movements_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: cash_movements cash_movements_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: cash_movements cash_movements_cash_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_cash_session_id_fkey FOREIGN KEY (cash_session_id) REFERENCES public.cash_sessions(id) ON DELETE CASCADE;


--
-- Name: cash_movements cash_movements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: cash_sessions cash_sessions_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_sessions
    ADD CONSTRAINT cash_sessions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: cash_sessions cash_sessions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_sessions
    ADD CONSTRAINT cash_sessions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: cash_sessions cash_sessions_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_sessions
    ADD CONSTRAINT cash_sessions_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: cash_sessions cash_sessions_opened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_sessions
    ADD CONSTRAINT cash_sessions_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: device_catalog_prices device_catalog_prices_price_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_catalog_prices
    ADD CONSTRAINT device_catalog_prices_price_version_id_fkey FOREIGN KEY (price_version_id) REFERENCES public.product_price_versions(id);


--
-- Name: device_catalog_prices device_catalog_prices_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_catalog_prices
    ADD CONSTRAINT device_catalog_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: device_catalog_prices device_catalog_prices_sync_business_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_catalog_prices
    ADD CONSTRAINT device_catalog_prices_sync_business_fkey FOREIGN KEY (catalog_sync_id, business_id) REFERENCES public.device_catalog_syncs(id, business_id);


--
-- Name: device_catalog_prices device_catalog_prices_version_product_business_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_catalog_prices
    ADD CONSTRAINT device_catalog_prices_version_product_business_fkey FOREIGN KEY (price_version_id, product_id, business_id) REFERENCES public.product_price_versions(id, product_id, business_id);


--
-- Name: device_catalog_syncs device_catalog_syncs_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_catalog_syncs
    ADD CONSTRAINT device_catalog_syncs_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: device_catalog_syncs device_catalog_syncs_device_business_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_catalog_syncs
    ADD CONSTRAINT device_catalog_syncs_device_business_fkey FOREIGN KEY (device_id, business_id) REFERENCES public.pos_devices(id, business_id);


--
-- Name: device_catalog_syncs device_catalog_syncs_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_catalog_syncs
    ADD CONSTRAINT device_catalog_syncs_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.pos_devices(id);


--
-- Name: device_catalog_syncs device_catalog_syncs_synced_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_catalog_syncs
    ADD CONSTRAINT device_catalog_syncs_synced_by_fkey FOREIGN KEY (synced_by) REFERENCES public.profiles(id);


--
-- Name: device_catalog_syncs device_catalog_syncs_user_business_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_catalog_syncs
    ADD CONSTRAINT device_catalog_syncs_user_business_fkey FOREIGN KEY (synced_by, business_id) REFERENCES public.profiles(id, business_id);


--
-- Name: inventory_movements inventory_movements_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: inventory_movements inventory_movements_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: inventory_movements inventory_movements_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: inventory_movements inventory_movements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: inventory_transfer_items inventory_transfer_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfer_items
    ADD CONSTRAINT inventory_transfer_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: inventory_transfer_items inventory_transfer_items_transfer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfer_items
    ADD CONSTRAINT inventory_transfer_items_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES public.inventory_transfers(id) ON DELETE RESTRICT;


--
-- Name: inventory_transfers inventory_transfers_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfers
    ADD CONSTRAINT inventory_transfers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: inventory_transfers inventory_transfers_destination_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfers
    ADD CONSTRAINT inventory_transfers_destination_branch_id_fkey FOREIGN KEY (destination_branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;


--
-- Name: inventory_transfers inventory_transfers_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfers
    ADD CONSTRAINT inventory_transfers_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: inventory_transfers inventory_transfers_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfers
    ADD CONSTRAINT inventory_transfers_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: inventory_transfers inventory_transfers_source_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfers
    ADD CONSTRAINT inventory_transfers_source_branch_id_fkey FOREIGN KEY (source_branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;


--
-- Name: mercadopago_connections mercadopago_connections_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mercadopago_connections
    ADD CONSTRAINT mercadopago_connections_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: pos_mobile_product_links mobile_product_link_business_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_product_links
    ADD CONSTRAINT mobile_product_link_business_fk FOREIGN KEY (product_id, business_id) REFERENCES public.products(id, business_id);


--
-- Name: pos_mobile_product_links mobile_product_link_device_business_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_product_links
    ADD CONSTRAINT mobile_product_link_device_business_fk FOREIGN KEY (device_id, business_id) REFERENCES public.pos_devices(id, business_id);


--
-- Name: offline_sale_conflicts offline_sale_conflicts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_sale_conflicts
    ADD CONSTRAINT offline_sale_conflicts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: offline_sale_conflicts offline_sale_conflicts_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_sale_conflicts
    ADD CONSTRAINT offline_sale_conflicts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: offline_sale_conflicts offline_sale_conflicts_cash_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_sale_conflicts
    ADD CONSTRAINT offline_sale_conflicts_cash_session_id_fkey FOREIGN KEY (cash_session_id) REFERENCES public.cash_sessions(id);


--
-- Name: offline_sale_conflicts offline_sale_conflicts_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_sale_conflicts
    ADD CONSTRAINT offline_sale_conflicts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id);


--
-- Name: pos_device_pairing_tokens pairing_token_device_business_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_pairing_tokens
    ADD CONSTRAINT pairing_token_device_business_fkey FOREIGN KEY (device_id, business_id) REFERENCES public.pos_devices(id, business_id);


--
-- Name: pos_device_pairing_tokens pairing_token_user_business_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_pairing_tokens
    ADD CONSTRAINT pairing_token_user_business_fkey FOREIGN KEY (created_by, business_id) REFERENCES public.profiles(id, business_id);


--
-- Name: platform_admins platform_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pos_device_auth_challenges pos_device_auth_challenges_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_auth_challenges
    ADD CONSTRAINT pos_device_auth_challenges_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.pos_devices(id) ON DELETE CASCADE;


--
-- Name: pos_device_pairing_challenges pos_device_pairing_challenges_pairing_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_pairing_challenges
    ADD CONSTRAINT pos_device_pairing_challenges_pairing_token_id_fkey FOREIGN KEY (pairing_token_id) REFERENCES public.pos_device_pairing_tokens(id);


--
-- Name: pos_device_pairing_resolutions pos_device_pairing_resolutions_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_pairing_resolutions
    ADD CONSTRAINT pos_device_pairing_resolutions_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.pos_devices(id) ON DELETE RESTRICT;


--
-- Name: pos_device_pairing_resolutions pos_device_pairing_resolutions_pairing_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_pairing_resolutions
    ADD CONSTRAINT pos_device_pairing_resolutions_pairing_challenge_id_fkey FOREIGN KEY (pairing_challenge_id) REFERENCES public.pos_device_pairing_challenges(id) ON DELETE RESTRICT;


--
-- Name: pos_device_pairing_tokens pos_device_pairing_tokens_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_pairing_tokens
    ADD CONSTRAINT pos_device_pairing_tokens_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: pos_device_pairing_tokens pos_device_pairing_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_pairing_tokens
    ADD CONSTRAINT pos_device_pairing_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: pos_device_pairing_tokens pos_device_pairing_tokens_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_device_pairing_tokens
    ADD CONSTRAINT pos_device_pairing_tokens_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.pos_devices(id);


--
-- Name: pos_devices pos_devices_branch_business_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_devices
    ADD CONSTRAINT pos_devices_branch_business_fkey FOREIGN KEY (branch_id, business_id) REFERENCES public.branches(id, business_id);


--
-- Name: pos_devices pos_devices_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_devices
    ADD CONSTRAINT pos_devices_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: pos_devices pos_devices_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_devices
    ADD CONSTRAINT pos_devices_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: pos_devices pos_devices_registered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_devices
    ADD CONSTRAINT pos_devices_registered_by_fkey FOREIGN KEY (registered_by) REFERENCES public.profiles(id);


--
-- Name: pos_devices pos_devices_user_business_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_devices
    ADD CONSTRAINT pos_devices_user_business_fkey FOREIGN KEY (registered_by, business_id) REFERENCES public.profiles(id, business_id);


--
-- Name: pos_mobile_cash_session_links pos_mobile_cash_session_links_cash_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_cash_session_links
    ADD CONSTRAINT pos_mobile_cash_session_links_cash_session_id_fkey FOREIGN KEY (cash_session_id) REFERENCES public.cash_sessions(id);


--
-- Name: pos_mobile_cash_session_links pos_mobile_cash_session_links_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_cash_session_links
    ADD CONSTRAINT pos_mobile_cash_session_links_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.pos_devices(id);


--
-- Name: pos_mobile_inventory_reconciliations pos_mobile_inventory_reconciliations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_inventory_reconciliations
    ADD CONSTRAINT pos_mobile_inventory_reconciliations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: pos_mobile_inventory_reconciliations pos_mobile_inventory_reconciliations_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_inventory_reconciliations
    ADD CONSTRAINT pos_mobile_inventory_reconciliations_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: pos_mobile_inventory_reconciliations pos_mobile_inventory_reconciliations_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_inventory_reconciliations
    ADD CONSTRAINT pos_mobile_inventory_reconciliations_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.pos_devices(id);


--
-- Name: pos_mobile_inventory_reconciliations pos_mobile_inventory_reconciliations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_inventory_reconciliations
    ADD CONSTRAINT pos_mobile_inventory_reconciliations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: pos_mobile_inventory_reconciliations pos_mobile_inventory_reconciliations_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_inventory_reconciliations
    ADD CONSTRAINT pos_mobile_inventory_reconciliations_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: pos_mobile_product_links pos_mobile_product_links_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_product_links
    ADD CONSTRAINT pos_mobile_product_links_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.pos_devices(id);


--
-- Name: pos_mobile_sync_operations pos_mobile_sync_operations_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_sync_operations
    ADD CONSTRAINT pos_mobile_sync_operations_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.pos_devices(id);


--
-- Name: product_price_versions product_price_versions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_price_versions
    ADD CONSTRAINT product_price_versions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: product_price_versions product_price_versions_product_business_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_price_versions
    ADD CONSTRAINT product_price_versions_product_business_fkey FOREIGN KEY (product_id, business_id) REFERENCES public.products(id, business_id);


--
-- Name: product_price_versions product_price_versions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_price_versions
    ADD CONSTRAINT product_price_versions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: products products_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: profile_branches profile_branches_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_branches
    ADD CONSTRAINT profile_branches_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: profile_branches profile_branches_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_branches
    ADD CONSTRAINT profile_branches_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: profile_branches profile_branches_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_branches
    ADD CONSTRAINT profile_branches_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: purchase_items purchase_items_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: purchase_items purchase_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: purchase_items purchase_items_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE;


--
-- Name: purchase_return_items purchase_return_items_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: purchase_return_items purchase_return_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: purchase_return_items purchase_return_items_purchase_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_purchase_item_id_fkey FOREIGN KEY (purchase_item_id) REFERENCES public.purchase_items(id) ON DELETE RESTRICT;


--
-- Name: purchase_return_items purchase_return_items_purchase_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_purchase_return_id_fkey FOREIGN KEY (purchase_return_id) REFERENCES public.purchase_returns(id) ON DELETE CASCADE;


--
-- Name: purchase_returns purchase_returns_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: purchase_returns purchase_returns_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: purchase_returns purchase_returns_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE RESTRICT;


--
-- Name: purchase_returns purchase_returns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: purchases purchases_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: purchases purchases_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: purchases purchases_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: purchases purchases_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: purchases purchases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: pos_mobile_inventory_reconciliations reconciliation_branch_business_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_inventory_reconciliations
    ADD CONSTRAINT reconciliation_branch_business_fk FOREIGN KEY (branch_id, business_id) REFERENCES public.branches(id, business_id);


--
-- Name: pos_mobile_inventory_reconciliations reconciliation_device_branch_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_inventory_reconciliations
    ADD CONSTRAINT reconciliation_device_branch_fk FOREIGN KEY (device_id, business_id, branch_id) REFERENCES public.pos_devices(id, business_id, branch_id);


--
-- Name: pos_mobile_inventory_reconciliations reconciliation_product_business_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_inventory_reconciliations
    ADD CONSTRAINT reconciliation_product_business_fk FOREIGN KEY (product_id, business_id) REFERENCES public.products(id, business_id);


--
-- Name: pos_mobile_inventory_reconciliations reconciliation_product_link_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_mobile_inventory_reconciliations
    ADD CONSTRAINT reconciliation_product_link_fk FOREIGN KEY (device_id, business_id, product_id, local_product_id) REFERENCES public.pos_mobile_product_links(device_id, business_id, product_id, local_product_id);


--
-- Name: sale_items sale_items_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: sale_items sale_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: sale_items sale_items_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: sale_return_items sale_return_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: sale_return_items sale_return_items_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.sale_returns(id) ON DELETE RESTRICT;


--
-- Name: sale_return_items sale_return_items_sale_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_sale_item_id_fkey FOREIGN KEY (sale_item_id) REFERENCES public.sale_items(id) ON DELETE RESTRICT;


--
-- Name: sale_returns sale_returns_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;


--
-- Name: sale_returns sale_returns_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: sale_returns sale_returns_cash_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_cash_session_id_fkey FOREIGN KEY (cash_session_id) REFERENCES public.cash_sessions(id) ON DELETE SET NULL;


--
-- Name: sale_returns sale_returns_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE RESTRICT;


--
-- Name: sale_returns sale_returns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sales sales_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: sales sales_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: sales sales_cash_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_cash_session_id_fkey FOREIGN KEY (cash_session_id) REFERENCES public.cash_sessions(id) ON DELETE SET NULL;


--
-- Name: sales sales_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: subscription_checkouts subscription_checkouts_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_checkouts
    ADD CONSTRAINT subscription_checkouts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: subscription_checkouts subscription_checkouts_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_checkouts
    ADD CONSTRAINT subscription_checkouts_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE RESTRICT;


--
-- Name: subscription_checkouts subscription_checkouts_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_checkouts
    ADD CONSTRAINT subscription_checkouts_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: subscriptions subscriptions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE RESTRICT;


--
-- Name: suppliers suppliers_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: products Admin y manager pueden actualizar productos de su negocio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin y manager pueden actualizar productos de su negocio" ON public.products FOR UPDATE TO authenticated USING ((public.has_role(ARRAY['admin'::text, 'manager'::text]) AND (business_id = public.current_business_id()) AND public.has_operational_subscription())) WITH CHECK ((public.has_role(ARRAY['admin'::text, 'manager'::text]) AND (business_id = public.current_business_id()) AND public.has_operational_subscription()));


--
-- Name: suppliers Admin y manager pueden actualizar proveedores de su negocio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin y manager pueden actualizar proveedores de su negocio" ON public.suppliers FOR UPDATE TO authenticated USING ((public.has_role(ARRAY['admin'::text, 'manager'::text]) AND (business_id = public.current_business_id()) AND public.has_operational_subscription())) WITH CHECK ((public.has_role(ARRAY['admin'::text, 'manager'::text]) AND (business_id = public.current_business_id()) AND public.has_operational_subscription()));


--
-- Name: products Admin y manager pueden crear productos de su negocio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin y manager pueden crear productos de su negocio" ON public.products FOR INSERT TO authenticated WITH CHECK ((public.has_role(ARRAY['admin'::text, 'manager'::text]) AND (business_id = public.current_business_id()) AND public.has_operational_subscription()));


--
-- Name: suppliers Admin y manager pueden crear proveedores de su negocio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin y manager pueden crear proveedores de su negocio" ON public.suppliers FOR INSERT TO authenticated WITH CHECK ((public.has_role(ARRAY['admin'::text, 'manager'::text]) AND (business_id = public.current_business_id()) AND public.has_operational_subscription()));


--
-- Name: purchases Admin y manager pueden leer compras de sucursales asignadas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin y manager pueden leer compras de sucursales asignadas" ON public.purchases FOR SELECT TO authenticated USING ((public.has_role(ARRAY['admin'::text, 'manager'::text]) AND (business_id = public.current_business_id()) AND (branch_id IS NOT NULL) AND public.has_branch_history_access(branch_id)));


--
-- Name: purchase_returns Admin y manager pueden leer devoluciones de sucursales asignada; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin y manager pueden leer devoluciones de sucursales asignada" ON public.purchase_returns FOR SELECT TO authenticated USING ((public.has_role(ARRAY['admin'::text, 'manager'::text]) AND (business_id = public.current_business_id()) AND (branch_id IS NOT NULL) AND public.has_branch_history_access(branch_id)));


--
-- Name: purchase_items Admin y manager pueden leer items de compra de su negocio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin y manager pueden leer items de compra de su negocio" ON public.purchase_items FOR SELECT TO authenticated USING ((public.has_role(ARRAY['admin'::text, 'manager'::text]) AND (business_id = public.current_business_id())));


--
-- Name: purchase_return_items Admin y manager pueden leer items de devolucion de su negocio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin y manager pueden leer items de devolucion de su negocio" ON public.purchase_return_items FOR SELECT TO authenticated USING ((public.has_role(ARRAY['admin'::text, 'manager'::text]) AND (business_id = public.current_business_id())));


--
-- Name: suppliers Admin y manager pueden leer proveedores de su negocio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin y manager pueden leer proveedores de su negocio" ON public.suppliers FOR SELECT TO authenticated USING ((public.has_role(ARRAY['admin'::text, 'manager'::text]) AND (business_id = public.current_business_id())));


--
-- Name: business_payment_settings Users can insert own business payment settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own business payment settings" ON public.business_payment_settings FOR INSERT TO authenticated WITH CHECK (((business_id = public.current_business_id()) AND public.is_active_user()));


--
-- Name: branches Users can read assigned branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read assigned branches" ON public.branches FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profile_branches pb
  WHERE ((pb.branch_id = branches.id) AND (pb.profile_id = auth.uid()) AND (pb.business_id = branches.business_id)))));


--
-- Name: profile_branches Users can read their branch assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their branch assignments" ON public.profile_branches FOR SELECT TO authenticated USING ((profile_id = auth.uid()));


--
-- Name: business_payment_settings Users can update own business payment settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own business payment settings" ON public.business_payment_settings FOR UPDATE TO authenticated USING (((business_id = public.current_business_id()) AND public.is_active_user())) WITH CHECK (((business_id = public.current_business_id()) AND public.is_active_user()));


--
-- Name: business_payment_settings Users can view own business payment settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own business payment settings" ON public.business_payment_settings FOR SELECT TO authenticated USING (((business_id = public.current_business_id()) AND public.is_active_user()));


--
-- Name: branch_inventory Usuarios pueden leer inventario de sucursales asignadas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden leer inventario de sucursales asignadas" ON public.branch_inventory FOR SELECT TO authenticated USING ((public.is_active_user() AND (business_id = public.current_business_id()) AND public.has_branch_access(branch_id)));


--
-- Name: sale_items Usuarios pueden leer items de venta de su negocio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden leer items de venta de su negocio" ON public.sale_items FOR SELECT TO authenticated USING ((public.is_active_user() AND (business_id = public.current_business_id())));


--
-- Name: cash_movements Usuarios pueden leer movimientos de caja de sucursales asignada; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden leer movimientos de caja de sucursales asignada" ON public.cash_movements FOR SELECT TO authenticated USING ((public.is_active_user() AND (business_id = public.current_business_id()) AND (branch_id IS NOT NULL) AND public.has_branch_history_access(branch_id)));


--
-- Name: inventory_movements Usuarios pueden leer movimientos de inventario de sucursales as; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden leer movimientos de inventario de sucursales as" ON public.inventory_movements FOR SELECT TO authenticated USING ((public.is_active_user() AND (business_id = public.current_business_id()) AND (branch_id IS NOT NULL) AND public.has_branch_history_access(branch_id)));


--
-- Name: products Usuarios pueden leer productos de su negocio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden leer productos de su negocio" ON public.products FOR SELECT TO authenticated USING ((public.is_active_user() AND (business_id = public.current_business_id())));


--
-- Name: cash_sessions Usuarios pueden leer sesiones de caja de sucursales asignadas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden leer sesiones de caja de sucursales asignadas" ON public.cash_sessions FOR SELECT TO authenticated USING ((public.is_active_user() AND (business_id = public.current_business_id()) AND (branch_id IS NOT NULL) AND public.has_branch_history_access(branch_id)));


--
-- Name: businesses Usuarios pueden leer su negocio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden leer su negocio" ON public.businesses FOR SELECT TO authenticated USING ((id IN ( SELECT profiles.business_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: profiles Usuarios pueden leer su propio perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden leer su propio perfil" ON public.profiles FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: sales Usuarios pueden leer ventas de sucursales asignadas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden leer ventas de sucursales asignadas" ON public.sales FOR SELECT TO authenticated USING ((public.is_active_user() AND (business_id = public.current_business_id()) AND (branch_id IS NOT NULL) AND public.has_branch_history_access(branch_id)));


--
-- Name: branch_inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- Name: business_payment_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_payment_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: businesses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: demo_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: device_catalog_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_catalog_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: device_catalog_syncs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_catalog_syncs ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_transfer_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_transfer_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_transfer_items inventory_transfer_items_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_transfer_items_read ON public.inventory_transfer_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.inventory_transfers t
  WHERE (t.id = inventory_transfer_items.transfer_id))));


--
-- Name: inventory_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_transfers inventory_transfers_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_transfers_read ON public.inventory_transfers FOR SELECT TO authenticated USING ((public.is_active_user() AND (business_id = public.current_business_id()) AND (public.has_branch_history_access(source_branch_id) OR public.has_branch_history_access(destination_branch_id))));


--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: mercadopago_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mercadopago_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_sale_conflicts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offline_sale_conflicts ENABLE ROW LEVEL SECURITY;

--
-- Name: plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_device_auth_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_device_auth_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_device_pairing_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_device_pairing_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_device_pairing_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_device_pairing_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_device_pairing_resolutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_device_pairing_resolutions ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_device_pairing_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_device_pairing_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_devices ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_mobile_cash_session_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_mobile_cash_session_links ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_mobile_inventory_reconciliations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_mobile_inventory_reconciliations ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_mobile_product_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_mobile_product_links ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_mobile_sync_operations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_mobile_sync_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: product_price_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_price_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_branches ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_return_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;

--
-- Name: purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_return_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_return_items sale_return_items_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sale_return_items_read ON public.sale_return_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.sale_returns sr
  WHERE ((sr.id = sale_return_items.return_id) AND (sr.business_id = public.current_business_id()) AND public.has_branch_history_access(sr.branch_id)))));


--
-- Name: sale_returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_returns sale_returns_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sale_returns_read ON public.sale_returns FOR SELECT TO authenticated USING ((public.is_active_user() AND (business_id = public.current_business_id()) AND public.has_branch_history_access(branch_id)));


--
-- Name: sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_checkouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_checkouts ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict VJCLtaSBHbpW7iCCJcBauU5Y5hPinbBQ99WPcorY6Is8kEb8WzfPbH8Ss9OdW9n
