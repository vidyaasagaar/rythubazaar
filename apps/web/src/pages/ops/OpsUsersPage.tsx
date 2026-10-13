import { useState } from 'react';
import { ROLES, type Role } from '@rythubazaar/shared';
import { api, qs } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Async,
  Button,
  Dialog,
  EmptyState,
  Input,
  Notice,
  PageHeader,
  Pagination,
  Pill,
  Select,
} from '../../components/ui';
import { DataList, FilterBar, FilterField } from '../../components/datalist';

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  status: string;
  preferredLanguage: string;
  createdAt: string;
}

export default function OpsUsersPage() {
  const { lang, errorText } = useI18n();
  const { can, user: me } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ q: '', role: '', page: 1 });
  const state = useApi((s) => api.page<UserRow>(`/api/admin/users${qs({ ...f, pageSize: 20 })}`, s), [f]);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [role, setRole] = useState<Role>('CUSTOMER');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await api.patch(`/api/admin/users/${editing.id}/role`, { role });
      toast('success', `Role changed to ${role}. The user's sessions were signed out.`);
      setEditing(null);
      state.reload();
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="People"
        subtitle={
          can('pii:read')
            ? 'Contact details visible to your role.'
            : 'Contact details are masked for your role.'
        }
      />
      <FilterBar onReset={() => setF({ q: '', role: '', page: 1 })}>
        <FilterField label="Name or email">
          <Input defaultValue={f.q} onBlur={(e) => setF({ ...f, q: e.target.value.trim(), page: 1 })} />
        </FilterField>
        <FilterField label="Role">
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, page: 1 })}>
            <option value="">All</option>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>
      <Async
        state={state}
        isEmpty={(d) => d.data.length === 0}
        empty={<EmptyState title="No people match." />}
      >
        {(d) => (
          <>
            <DataList
              rows={d.data}
              rowKey={(u) => u.id}
              columns={[
                { header: 'Name', cell: (u) => u.name },
                { header: 'Email', cell: (u) => <span className="break-all">{u.email}</span> },
                { header: 'Phone', cell: (u) => u.phone ?? '—' },
                {
                  header: 'Role',
                  cell: (u) => (
                    <Pill
                      tone={
                        u.role === 'ADMIN'
                          ? 'red'
                          : u.role === 'FARMER'
                            ? 'green'
                            : u.role === 'CUSTOMER'
                              ? 'neutral'
                              : 'blue'
                      }
                    >
                      {u.role}
                    </Pill>
                  ),
                },
                { header: 'Language', cell: (u) => u.preferredLanguage },
                { header: 'Joined', cell: (u) => formatDate(u.createdAt, lang) },
                {
                  header: '',
                  cell: (u) =>
                    can('users:manage-roles') && u.id !== me?.id ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditing(u);
                          setRole(u.role);
                        }}
                      >
                        Change role
                      </Button>
                    ) : null,
                },
              ]}
            />
            <Pagination meta={d.meta} onPage={(p) => setF({ ...f, page: p })} />
          </>
        )}
      </Async>
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Change role — ${editing?.name ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={busy} disabled={role === editing?.role} onClick={save}>
              Save role
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
          <Notice tone="amber">
            Role changes are audited and sign the user out of all sessions. Grant ADMIN only when necessary.
          </Notice>
        </div>
      </Dialog>
    </>
  );
}
