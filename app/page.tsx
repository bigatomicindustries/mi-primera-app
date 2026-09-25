'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabase';

type Cliente = {
  nombre: string;
  email: string;
  empresa: string;
};

export default function Home() {
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [empresa, setEmpresa] = useState('');

  const [clientes, setClientes] = useState<Cliente[]>([]);

  const handleCrearCliente = () => {
    setMostrarFormulario(true);
  };

  const handleGuardarCliente = async () => {
    if (!nombre.trim() || !email.trim() || !empresa.trim()) {
      alert('Por favor, llena todos los campos.');
      return;
    }

    setGuardando(true);

    const nuevoCliente: Cliente = {
      nombre: nombre.trim(),
      email: email.trim(),
      empresa: empresa.trim(),
    };

    const { error } = await supabase
      .from('clientes')
      .insert([nuevoCliente]);

    if (error) {
      console.error('Código:', error.code);
      console.error('Mensaje:', error.message);
      console.error('Detalles:', error.details);
      console.error('Hint:', error.hint);

      alert(`Error: ${error.message}`);

      setGuardando(false);
      return;
    }

    console.log('Cliente guardado correctamente');

    setClientes((clientesActuales) => [
      ...clientesActuales,
      nuevoCliente,
    ]);

    setNombre('');
    setEmail('');
    setEmpresa('');
    setMostrarFormulario(false);
    setGuardando(false);
  };

  const handleCancelar = () => {
    setNombre('');
    setEmail('');
    setEmpresa('');
    setMostrarFormulario(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-slate-100">

        <div className="bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">🚀</span>
        </div>

        <h1 className="text-2xl font-bold text-slate-800 mb-3">
          Mi primera app
        </h1>

        <p className="text-slate-500 mb-8 leading-relaxed">
          Diseñando interfaces modernas, atractivas y listas para producción.
        </p>

        {!mostrarFormulario && (
          <button
            onClick={handleCrearCliente}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-indigo-100 active:scale-95"
          >
            Crear cliente
          </button>
        )}

        {mostrarFormulario && (
          <div className="mt-2 text-left">
            <h2 className="text-lg font-bold text-slate-800 mb-4 text-center">
              Nuevo cliente
            </h2>

            <input
              type="text"
              placeholder="Nombre del cliente"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={guardando}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 mb-3 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
            />

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={guardando}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 mb-3 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
            />

            <input
              type="text"
              placeholder="Empresa"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              disabled={guardando}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 mb-3 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
            />

            <div className="flex flex-col gap-3">
              <button
                onClick={handleGuardarCliente}
                disabled={guardando}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl transition-colors duration-200 shadow-sm disabled:bg-emerald-400 disabled:cursor-not-allowed flex justify-center items-center"
              >
                {guardando ? 'Guardando...' : 'Guardar cliente'}
              </button>

              <button
                onClick={handleCancelar}
                disabled={guardando}
                className="w-full bg-white hover:bg-slate-50 text-slate-600 font-semibold py-3 rounded-xl border border-slate-200 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {clientes.length > 0 && (
          <div className="mt-8 text-left border-t border-slate-100 pt-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              Clientes guardados ({clientes.length})
            </h2>

            <div className="space-y-3">
              {clientes.map((cliente, index) => (
                <div
                  key={index}
                  className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex flex-col"
                >
                  <p className="font-semibold text-slate-800">
                    {cliente.nombre}
                  </p>
                  <p className="text-sm text-slate-600 mt-1">
                    📧 {cliente.email}
                  </p>
                  <p className="text-sm text-slate-600">
                    🏢 {cliente.empresa}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}