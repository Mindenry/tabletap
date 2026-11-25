'use client';

import * as React from 'react';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import {
  BellRing,
  Check,
  ChevronLeft,
  Clock,
  Flame,
  Minus,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { socketBaseUrl } from '@/lib/socket';
import { cn, elapsedLabel, formatTHB } from '@/lib/utils';

interface PublicOption {
  id: string;
  name: string;
  nameEn: string | null;
  priceDelta: string;
}

interface PublicGroup {
  id: string;
  name: string;
  nameEn: string | null;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: PublicOption[];
}

export interface PublicItem {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  description: string | null;
  descriptionEn: string | null;
  imageUrl: string | null;
  basePrice: string;
  prepMinutes: number;
  isFeatured: boolean;
  isPopular: boolean;
  available: boolean;
  soldOut: boolean;
  variants: Array<{
    id: string;
    name: string;
    nameEn: string | null;
    priceDelta: string;
    isDefault: boolean;
  }>;
  modifierGroups: PublicGroup[];
  allergens: Array<{ code: string; name: string; nameTh: string | null }>;
}

interface PublicCategory {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  items: PublicItem[];
}

interface CartLine {
  key: string;
  itemId: string;
  name: string;
  basePrice: string;
  variantId?: string;
  variantName?: string;
  variantDelta: string;
  modifierOptionIds: string[];
  modifierNames: string[];
  modifiersTotal: string;
  note?: string;
  quantity: number;
}

interface SessionOrder {
  id: string;
  number: string;
  status: string;
  total: string;
  createdAt: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    status: string;
    note: string | null;
    modifiers: Array<{ name: string }>;
  }>;
}

interface SessionState {
  status: string;
  table: { id: string; number: string; name: string | null };
  restaurant: { name: string; branch: string };
  orders: SessionOrder[];
  bill: { id: string; number: string; status: string; total: string; due: string } | null;
  orderTotal: string;
  requests: Array<{ id: string; type: string; status: string; createdAt: string }>;
}

function estimateLine(line: CartLine): number {
  return (Number(line.basePrice) + Number(line.variantDelta) + Number(line.modifiersTotal)) * line.quantity;
}

export function GuestMenu({
  token,
  restaurant,
  table,
  initialMenu,
}: {
  token: string;
  restaurant: { name: string; branch: string; currency: string; timezone: string; logoUrl: string | null };
  table: { id: string; number: string; name: string | null };
  initialMenu: PublicCategory[];
}) {
  const [menu, setMenu] = React.useState(initialMenu);
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [activeCategory, setActiveCategory] = React.useState(initialMenu[0]?.id ?? '');
  const [search, setSearch] = React.useState('');
  const [detail, setDetail] = React.useState<PublicItem | null>(null);
  const [view, setView] = React.useState<'menu' | 'orders'>('menu');
  const [session, setSession] = React.useState<SessionState | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [sessionReady, setSessionReady] = React.useState(false);
  const [lastOrderId, setLastOrderId] = React.useState<string | null>(null);
  const [requestBusy, setRequestBusy] = React.useState(false);
  const idempotencyRef = React.useRef<string>(`ord-${Math.random().toString(36).slice(2)}`);

  // Restore the cart for this table across refreshes.
  React.useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`tt-cart-${token}`);
      if (stored) setCart(JSON.parse(stored) as CartLine[]);
    } catch {
      // ignore malformed storage
    }
  }, [token]);

  React.useEffect(() => {
    try {
      sessionStorage.setItem(`tt-cart-${token}`, JSON.stringify(cart));
    } catch {
      // storage can be unavailable in private mode
    }
  }, [cart, token]);

  const refreshSession = React.useCallback(async () => {
    try {
      const state = await clientApi<SessionState>('/public/customer-session');
      setSession(state);
    } catch (error) {
      // A missing session before the first order is expected.
      if (!(error instanceof Error && 'status' in error && (error as { status?: number }).status === 401)) {
        // keep the UI usable; the next action will surface a real error
      }
    }
  }, []);

  React.useEffect(() => {
    if (view !== 'orders') return;
    void refreshSession();
    const timer = setInterval(() => void refreshSession(), 12_000);
    return () => clearInterval(timer);
  }, [view, refreshSession]);

  React.useEffect(() => {
    if (view !== 'orders') return;
    const apiUrl = socketBaseUrl();
    const socket: Socket = io(`${apiUrl}/realtime`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    const onChange = () => void refreshSession();
    socket.on('order.updated', onChange);
    socket.on('order.accepted', onChange);
    socket.on('kitchen.item.ready', onChange);
    socket.on('table.updated', onChange);
    return () => {
      socket.disconnect();
    };
  }, [view, refreshSession]);

  async function ensureSession(): Promise<boolean> {
    if (sessionReady) return true;
    try {
      await clientApi(`/public/qr/${token}/session`, { method: 'POST', body: { guestCount: 0 } });
      setSessionReady(true);
      return true;
    } catch (error) {
      if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 409) {
        // Session already exists for this browser/table; treat as ready.
        setSessionReady(true);
        return true;
      }
      toast.error(errorMessage(error));
      return false;
    }
  }

  function changeQuantity(key: string, delta: number) {
    setCart((current) =>
      current
        .map((line) => (line.key === key ? { ...line, quantity: Math.max(0, line.quantity + delta) } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  async function submitOrder() {
    if (cart.length === 0) return;
    if (!(await ensureSession())) return;
    setSubmitting(true);
    try {
      const order = await clientApi<{ id: string; number: string; total: string }>(
        '/public/customer-session/orders',
        {
          method: 'POST',
          idempotencyKey: idempotencyRef.current,
          body: {
            items: cart.map((line) => ({
              menuItemId: line.itemId,
              ...(line.variantId ? { variantId: line.variantId } : {}),
              quantity: line.quantity,
              ...(line.modifierOptionIds.length > 0 ? { modifierOptionIds: line.modifierOptionIds } : {}),
              ...(line.note ? { note: line.note } : {}),
            })),
            note: undefined,
          },
        },
      );
      idempotencyRef.current = `ord-${Math.random().toString(36).slice(2)}`;
      setCart([]);
      sessionStorage.removeItem(`tt-cart-${token}`);
      setLastOrderId(order.id);
      setCartOpen(false);
      setView('orders');
      toast.success(`Order ${order.number} sent to the kitchen`);
      await refreshSession();
      const fresh = await clientApi<{ menu: PublicCategory[] }>('/public/customer-session/menu');
      setMenu(fresh.menu);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function request(type: 'CALL_WAITER' | 'REQUEST_WATER' | 'REQUEST_UTENSILS' | 'REQUEST_BILL') {
    if (!(await ensureSession())) return;
    setRequestBusy(true);
    try {
      await clientApi('/public/customer-session/requests', { method: 'POST', body: { type } });
      toast.success(
        type === 'REQUEST_BILL'
          ? 'Bill requested — staff will bring it shortly'
          : type === 'CALL_WAITER'
            ? 'A team member is on the way'
            : 'Request sent',
      );
      await refreshSession();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRequestBusy(false);
    }
  }

  const filteredMenu = React.useMemo(() => {
    if (!search.trim()) return menu;
    const needle = search.trim().toLowerCase();
    return menu
      .map((category) => ({
        ...category,
        items: category.items.filter((item) =>
          `${item.name} ${item.nameEn ?? ''} ${item.descriptionEn ?? ''}`.toLowerCase().includes(needle),
        ),
      }))
      .filter((category) => category.items.length > 0);
  }, [menu, search]);

  const cartCount = cart.reduce((acc, line) => acc + line.quantity, 0);
  const cartTotal = cart.reduce((acc, line) => acc + estimateLine(line), 0);
  const activeOrders =
    session?.orders.filter((order) => !['SERVED', 'CANCELLED'].includes(order.status)) ?? [];
  const latestStatus = lastOrderId
    ? session?.orders.find((order) => order.id === lastOrderId)?.status
    : undefined;

  return (
    <div className="min-h-screen bg-paper pb-28">
      <header className="bg-night px-5 pb-7 pt-6 text-[#f3ede2]">
        <div className="mx-auto w-full max-w-2xl animate-rise">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[9.5px] uppercase tracking-[0.18em] text-[#8f8574]">{restaurant.branch}</p>
              <h1 className="mt-1 truncate font-display text-[34px] leading-none text-white">
                {restaurant.name}
              </h1>
              <p className="mt-2 text-[11.5px] text-[#a49a88]">
                Table {table.number}
                {table.name ? ` · ${table.name}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={() => request('CALL_WAITER')}
                disabled={requestBusy}
                className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-[#3a3327] px-2.5 text-[10.5px] font-medium text-[#e9e3d6] transition-colors hover:border-[#6d5a2f] hover:text-white"
              >
                <BellRing className="h-3 w-3" /> Call waiter
              </button>
              <button
                type="button"
                onClick={() => {
                  setView(view === 'menu' ? 'orders' : 'menu');
                  if (view === 'menu') void refreshSession();
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-brand px-2.5 text-[10.5px] font-semibold text-white transition-colors hover:bg-brand-deep"
              >
                {view === 'menu' ? (
                  <>
                    <Clock className="h-3 w-3" /> My orders
                    {activeOrders.length > 0 ? ` · ${activeOrders.length}` : ''}
                  </>
                ) : (
                  <>
                    <Utensils className="h-3 w-3" /> Menu
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="mt-5 h-px bg-[#3a3327]" />
        </div>
      </header>

      {view === 'menu' ? (
        <main className="mx-auto w-full max-w-3xl px-4">
          <div className="sticky top-0 z-20 -mx-4 mb-1 bg-paper px-4 pb-0 pt-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-0 top-2.5 h-3.5 w-3.5 text-muted-soft" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search dishes, drinks, allergies…"
                aria-label="Search the menu"
                className="h-9 w-full border-0 border-b border-line bg-transparent pl-6 pr-8 text-[13px] text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-0"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-0 top-1.5 p-1 text-muted hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            {!search ? (
              <div className="mt-2 flex gap-5 overflow-x-auto pr-6 scrollbar-thin [mask-image:linear-gradient(to_right,black_92%,transparent)]">
                {menu.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(category.id);
                      document
                        .getElementById(`cat-${category.id}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={cn(
                      'shrink-0 border-b-2 pb-1.5 text-[12px] font-medium transition-colors',
                      activeCategory === category.id
                        ? 'border-ink text-ink'
                        : 'border-transparent text-muted hover:text-ink',
                    )}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {filteredMenu.length === 0 ? (
            <div className="mt-8 rounded-lg border border-dashed border-line-strong bg-surface/60 p-10 text-center">
              <p className="text-[14px] font-medium">No dishes match “{search}”</p>
              <p className="mt-1 text-[12px] text-muted">Try another word, or clear the search.</p>
            </div>
          ) : (
            <div className="mt-6 space-y-10">
              {filteredMenu.map((category) => (
                <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-4">
                  <div className="mb-3 flex items-end justify-between">
                    <div>
                      <h2 className="font-[family-name:var(--font-display)] text-[22px] leading-none">
                        {category.name}
                      </h2>
                      {category.nameEn ? (
                        <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-muted">
                          {category.nameEn}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-muted">{category.items.length} items</span>
                  </div>
                  <div className="border-t border-line">
                    {category.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={item.soldOut}
                        onClick={() => setDetail(item)}
                        className={cn(
                          'group flex w-full items-center gap-4 border-b border-line py-3.5 text-left transition-colors',
                          item.soldOut ? 'opacity-50' : 'hover:bg-surface/70',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="font-display text-[19px] leading-tight text-ink">{item.name}</p>
                            <span className="money shrink-0 text-[13px] text-ink">
                              {formatTHB(item.basePrice)}
                            </span>
                          </div>
                          {item.nameEn ? (
                            <p className="mt-0.5 text-[9.5px] uppercase tracking-[0.12em] text-muted-soft">
                              {item.nameEn}
                            </p>
                          ) : null}
                          <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
                            {item.descriptionEn ?? item.description}
                          </p>
                          <p className="mt-1 text-[9px] uppercase tracking-[0.14em] text-muted-soft">
                            {item.soldOut ? 'Sold out' : `${item.prepMinutes} min`}
                            {item.isPopular ? ' · popular' : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => request('REQUEST_WATER')}
              disabled={requestBusy}
              className="border border-line-strong bg-surface px-3 py-1.5 text-[11px] font-medium hover:bg-paper-deep"
            >
              ขอน้ำ / Water
            </button>
            <button
              type="button"
              onClick={() => request('REQUEST_UTENSILS')}
              disabled={requestBusy}
              className="border border-line-strong bg-surface px-3 py-1.5 text-[11px] font-medium hover:bg-paper-deep"
            >
              ขอช้อนส้อม / Utensils
            </button>
            <button
              type="button"
              onClick={() => request('REQUEST_BILL')}
              disabled={requestBusy}
              className="border border-line-strong bg-surface px-3 py-1.5 text-[11px] font-medium hover:bg-paper-deep"
            >
              <Receipt className="mr-1 inline h-3 w-3" /> เก็บเงิน / Bill
            </button>
          </div>
          <p className="mt-4 text-center text-[10px] text-muted">
            Prices include VAT where applicable. A service charge may be added at the bill.
          </p>
        </main>
      ) : (
        <main className="mx-auto w-full max-w-2xl px-4 pt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] font-semibold tracking-tight">Your table</h2>
            <button
              type="button"
              onClick={() => request('REQUEST_BILL')}
              disabled={requestBusy}
              className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-medium text-paper hover:bg-ink-soft"
            >
              Request bill
            </button>
          </div>

          {!session || session.orders.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-surface/60 p-8 text-center">
              <ShoppingBag className="mx-auto h-7 w-7 text-muted" />
              <p className="mt-2 text-[14px] font-medium">No orders yet</p>
              <p className="mt-1 text-[12px] text-muted">
                Your order will appear here with live kitchen progress.
              </p>
              <button
                type="button"
                onClick={() => setView('menu')}
                className="mt-4 rounded-md bg-ink px-4 py-2 text-[12px] font-medium text-paper"
              >
                Browse the menu
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {session.bill ? (
                <div className="rounded-lg border border-line bg-surface-raised p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-semibold">Bill {session.bill.number}</p>
                      <p className="text-[11px] text-muted">Please settle at the counter or with staff</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-[16px] font-semibold">{formatTHB(session.bill.due)}</p>
                      <p className="text-[10px] text-muted">{session.bill.status.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {session.orders.map((order) => (
                <div key={order.id} className="rounded-lg border border-line bg-surface-raised">
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <div>
                      <p className="text-[12px] font-semibold">{order.number}</p>
                      <p className="text-[11px] text-muted">
                        {formatTime(order.createdAt)} · {order.items.length} item(s)
                      </p>
                    </div>
                    <OrderProgress status={order.status} isLatest={order.id === lastOrderId} />
                  </div>
                  <ul className="divide-y divide-line/60 px-4">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="text-[12px]">
                            <span className="font-medium">
                              {item.quantity} × {item.name}
                            </span>
                          </p>
                          {item.modifiers.length > 0 ? (
                            <p className="text-[11px] text-muted">
                              {item.modifiers.map((modifier) => modifier.name).join(' · ')}
                            </p>
                          ) : null}
                          {item.note ? <p className="text-[11px] text-gold">{item.note}</p> : null}
                        </div>
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">
                          {item.status.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
                    <span className="text-[11px] text-muted">Order total</span>
                    <span className="tabular text-[13px] font-semibold">{formatTHB(order.total)}</span>
                  </div>
                </div>
              ))}

              {session.orders.some((order) => order.status === 'PENDING') ? (
                <p className="rounded-md bg-gold-soft/70 px-3 py-2 text-[11px] text-gold">
                  Waiting for the kitchen to accept. You can cancel within this window from this screen.
                </p>
              ) : null}

              <div className="flex items-center justify-between rounded-lg border border-line bg-surface-raised px-4 py-3">
                <span className="text-[12px] text-muted">Running total (before final bill)</span>
                <span className="tabular text-[15px] font-semibold">{formatTHB(session.orderTotal)}</span>
              </div>
            </div>
          )}
        </main>
      )}

      {cartCount > 0 && view === 'menu' ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised/95 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-muted">{cartCount} item(s)</p>
              <p className="tabular text-[16px] font-semibold">{formatTHB(cartTotal)}</p>
            </div>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-deep"
            >
              <ShoppingBag className="h-4 w-4" /> Review order
            </button>
          </div>
        </div>
      ) : null}

      {detail ? (
        <ItemSheet
          item={detail}
          onClose={() => setDetail(null)}
          onAdd={(line) => {
            setCart((current) => [...current, line]);
            setDetail(null);
            toast.success(`${line.name} added`);
          }}
        />
      ) : null}

      {cartOpen ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close cart"
            className="absolute inset-0 animate-fade bg-night/40 backdrop-blur-[2px]"
            onClick={() => setCartOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] animate-slide-up overflow-y-auto rounded-t-2xl border-t border-line bg-surface-raised p-5 scrollbar-thin">
            <div className="mx-auto w-full max-w-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-[18px] font-semibold tracking-tight">Your order</h2>
                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  className="rounded p-1.5 text-muted hover:bg-paper-deep"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="mt-4 divide-y divide-line">
                {cart.map((line) => (
                  <li key={line.key} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">{line.name}</p>
                      {line.variantName || line.modifierNames.length > 0 || line.note ? (
                        <p className="text-[11px] text-muted">
                          {[line.variantName, ...line.modifierNames, line.note].filter(Boolean).join(' · ')}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="flex items-center rounded-md border border-line-strong">
                        <button
                          type="button"
                          onClick={() => changeQuantity(line.key, -1)}
                          className="px-2 py-1 text-muted hover:text-ink"
                          aria-label={`Remove one ${line.name}`}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center text-[12px] font-semibold tabular">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => changeQuantity(line.key, 1)}
                          className="px-2 py-1 text-muted hover:text-ink"
                          aria-label={`Add one ${line.name}`}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="w-16 text-right text-[12px] font-medium tabular">
                        {formatTHB(estimateLine(line))}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              <dl className="mt-3 space-y-1 border-t border-line pt-3 text-[12px]">
                <div className="flex justify-between">
                  <dt className="text-muted">Subtotal</dt>
                  <dd className="tabular">{formatTHB(cartTotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Service charge & VAT</dt>
                  <dd className="text-muted">Calculated on the server</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2 text-[15px] font-semibold">
                  <dt>Estimated total</dt>
                  <dd className="tabular">{formatTHB(cartTotal)}</dd>
                </div>
              </dl>

              <p className="mt-2 text-[11px] text-muted">
                You will see the exact total, including any service charge, before the final bill. Tapping
                once sends the order — repeated taps cannot create duplicates.
              </p>

              <button
                type="button"
                onClick={submitOrder}
                disabled={submitting}
                className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-ink text-[14px] font-semibold text-paper hover:bg-ink-soft disabled:opacity-60"
              >
                {submitting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-paper border-t-transparent" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Send order to kitchen · {formatTHB(cartTotal)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}

const PROGRESS = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'];

function OrderProgress({ status, isLatest }: { status: string; isLatest: boolean }) {
  if (status === 'CANCELLED') {
    return (
      <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-danger">
        Cancelled
      </span>
    );
  }
  const index = Math.max(0, PROGRESS.indexOf(status));
  return (
    <div className="flex items-center gap-1">
      {PROGRESS.map((step, stepIndex) => (
        <React.Fragment key={step}>
          <span
            className={cn(
              'h-1.5 w-4 rounded-full',
              stepIndex <= index ? 'bg-brand' : 'bg-line',
              isLatest && stepIndex === index && 'animate-pulse-soft',
            )}
            title={step}
          />
        </React.Fragment>
      ))}
      <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
        {status.toLowerCase()}
      </span>
    </div>
  );
}

function ItemSheet({
  item,
  onClose,
  onAdd,
}: {
  item: PublicItem;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const [variantId, setVariantId] = React.useState<string | undefined>(
    item.variants.find((variant) => variant.isDefault)?.id ?? item.variants[0]?.id,
  );
  const [selected, setSelected] = React.useState<Record<string, string[]>>({});
  const [note, setNote] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);
  const [error, setError] = React.useState<string | null>(null);

  const variant = item.variants.find((candidate) => candidate.id === variantId);
  const selectedOptions = item.modifierGroups.flatMap((group) =>
    (selected[group.id] ?? []).map((optionId) => ({
      group,
      option: group.options.find((option) => option.id === optionId)!,
    })),
  );
  const unitPrice =
    Number(item.basePrice) +
    Number(variant?.priceDelta ?? 0) +
    selectedOptions.reduce((acc, entry) => acc + Number(entry.option.priceDelta), 0);

  function toggle(group: PublicGroup, optionId: string) {
    setSelected((current) => {
      const existing = current[group.id] ?? [];
      if (existing.includes(optionId)) {
        return { ...current, [group.id]: existing.filter((id) => id !== optionId) };
      }
      if (group.maxSelect === 1) return { ...current, [group.id]: [optionId] };
      if (existing.length >= group.maxSelect) return current;
      return { ...current, [group.id]: [...existing, optionId] };
    });
  }

  function add() {
    for (const group of item.modifierGroups) {
      const count = (selected[group.id] ?? []).length;
      if (group.required && count < Math.max(1, group.minSelect)) {
        setError(`Choose ${group.name}`);
        return;
      }
      if (count < group.minSelect) {
        setError(`Choose at least ${group.minSelect} in ${group.name}`);
        return;
      }
    }
    setError(null);
    onAdd({
      key: `${item.id}-${variantId ?? 'base'}-${JSON.stringify(selected)}-${Date.now()}`,
      itemId: item.id,
      name: item.name,
      basePrice: item.basePrice,
      variantId,
      variantName: variant?.name,
      variantDelta: variant?.priceDelta ?? '0',
      modifierOptionIds: selectedOptions.map((entry) => entry.option.id),
      modifierNames: selectedOptions.map((entry) => entry.option.name),
      modifiersTotal: selectedOptions
        .reduce((acc, entry) => acc + Number(entry.option.priceDelta), 0)
        .toFixed(2),
      note: note.trim() || undefined,
      quantity,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close dish"
        className="absolute inset-0 bg-night/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative max-h-[92vh] w-full max-w-lg animate-slide-up overflow-y-auto rounded-t-2xl border border-line bg-surface-raised scrollbar-thin sm:animate-scale-in sm:rounded-2xl">
        <div className="relative border-b border-line px-5 pb-3 pt-4">
          <p className="text-[9.5px] uppercase tracking-[0.18em] text-muted-soft">{item.nameEn ?? 'Menu'}</p>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-sm p-1.5 text-muted hover:bg-paper-deep hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-[24px] leading-tight">
                {item.name}
              </h2>
              {item.nameEn ? <p className="text-[12px] text-muted">{item.nameEn}</p> : null}
            </div>
            <span className="tabular text-[18px] font-semibold">{formatTHB(unitPrice * quantity)}</span>
          </div>
          {item.description ? (
            <p className="mt-2 text-[12px] leading-relaxed text-muted">{item.description}</p>
          ) : null}
          {item.allergens.length > 0 ? (
            <p className="mt-2 text-[11px] text-danger">
              Contains: {item.allergens.map((allergen) => allergen.name).join(', ')}
            </p>
          ) : null}

          {item.variants.length > 0 ? (
            <fieldset className="mt-4">
              <legend className="mb-1.5 text-[12px] font-semibold">Size / option</legend>
              <div className="flex flex-wrap gap-1.5">
                {item.variants.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setVariantId(candidate.id)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-[12px]',
                      variantId === candidate.id
                        ? 'border-brand bg-brand-soft text-brand-deep'
                        : 'border-line text-ink-soft',
                    )}
                  >
                    {candidate.name}
                    {Number(candidate.priceDelta) !== 0 ? ` +${formatTHB(candidate.priceDelta)}` : ''}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          {item.modifierGroups.map((group) => (
            <fieldset key={group.id} className="mt-4">
              <legend className="mb-1.5 flex w-full items-baseline justify-between gap-2">
                <span className="text-[12px] font-semibold">{group.name}</span>
                <span className="text-[10px] text-muted">
                  {group.required ? 'Required' : 'Optional'} · up to {group.maxSelect}
                </span>
              </legend>
              <div className="space-y-1">
                {group.options.map((option) => {
                  const checked = (selected[group.id] ?? []).includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggle(group, option.id)}
                      aria-pressed={checked}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-[12px]',
                        checked ? 'border-brand bg-brand-soft/60' : 'border-line hover:border-line-strong',
                      )}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={cn(
                            'grid h-4 w-4 place-items-center rounded-full border',
                            checked ? 'border-brand bg-brand text-white' : 'border-line-strong',
                          )}
                        >
                          {checked ? <Check className="h-2.5 w-2.5" /> : null}
                        </span>
                        {option.name}
                        {option.nameEn ? <span className="text-muted">· {option.nameEn}</span> : null}
                      </span>
                      {Number(option.priceDelta) !== 0 ? (
                        <span className="tabular text-muted">+{formatTHB(option.priceDelta)}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="mt-4">
            <label htmlFor="dish-note" className="mb-1 block text-[12px] font-semibold">
              Special instructions
            </label>
            <textarea
              id="dish-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={300}
              rows={2}
              placeholder="No coriander, extra spicy…"
              className="w-full rounded-md border border-line bg-paper/60 px-3 py-2 text-[12px] focus:border-brand focus:outline-none"
            />
          </div>

          {error ? (
            <p role="alert" className="mt-2 text-[12px] text-danger">
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <div className="flex items-center rounded-md border border-line-strong">
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                className="px-3 py-2"
                aria-label="Decrease quantity"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-8 text-center text-[13px] font-semibold tabular">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.min(20, value + 1))}
                className="px-3 py-2"
                aria-label="Increase quantity"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={add}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-brand text-[14px] font-semibold text-white hover:bg-brand-deep"
            >
              <Sparkles className="h-4 w-4" /> Add · {formatTHB(unitPrice * quantity)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
