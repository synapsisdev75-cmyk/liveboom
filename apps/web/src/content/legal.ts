export type LegalDoc = {
  slug: string;
  title: string;
  updated: string;
  sections: { heading: string; body: string }[];
};

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: 'terminos',
    title: 'Términos y Condiciones',
    updated: '22 de agosto de 2026',
    sections: [
      {
        heading: '1. Aceptación',
        body: 'Al crear una cuenta o usar Liveboom aceptas estos Términos y Condiciones. Si no estás de acuerdo, no utilices la plataforma. Debes ser mayor de 18 años.',
      },
      {
        heading: '2. Servicio',
        body: 'Liveboom es una plataforma de transmisiones en vivo, contenido social, regalos virtuales (coins) y comunidad. Podemos modificar, suspender o discontinuar funciones con aviso razonable cuando sea posible.',
      },
      {
        heading: '3. Cuenta y conducta',
        body: 'Eres responsable de la actividad en tu cuenta. Está prohibido el acoso, contenido ilegal, suplantación, spam, malware y cualquier uso que vulnere derechos de terceros. Podemos moderar, limitar o cerrar cuentas que incumplan estas reglas.',
      },
      {
        heading: '4. Contenido y propiedad',
        body: 'Conservas los derechos sobre el contenido que publicas. Al publicar en Liveboom nos concedes una licencia no exclusiva, mundial y gratuita para alojar, mostrar y distribuir tu contenido dentro del servicio. No vendemos tu contenido a terceros sin tu consentimiento.',
      },
      {
        heading: '5. Coins y pagos',
        body: 'Los coins son créditos virtuales para uso dentro de la plataforma. Las compras procesadas por proveedores de pago (por ejemplo Wompi) están sujetas a sus políticas. Los reembolsos se evalúan según la ley aplicable y las políticas de la tienda de pagos.',
      },
      {
        heading: '6. Lives y privacidad',
        body: 'Puedes transmitir en modo público o privado. Eres responsable de obtener los consentimientos necesarios de personas que aparezcan en tus transmisiones. Consulta nuestro Aviso de Privacidad para el tratamiento de datos personales.',
      },
      {
        heading: '7. Limitación de responsabilidad',
        body: 'Liveboom se ofrece “tal cual”. En la medida permitida por la ley, no somos responsables por daños indirectos, pérdida de datos o interrupciones del servicio. Nuestra responsabilidad total se limita al monto que hayas pagado a Liveboom en los últimos 12 meses, si aplica.',
      },
      {
        heading: '8. Ley aplicable',
        body: 'Estos términos se rigen por las leyes de la República de Colombia. Cualquier disputa se someterá a los tribunales competentes de Colombia, salvo norma imperativa en contrario.',
      },
      {
        heading: '9. Contacto',
        body: 'Para consultas legales: legal@liveboom.app',
      },
    ],
  },
  {
    slug: 'privacidad',
    title: 'Aviso de Privacidad',
    updated: '22 de agosto de 2026',
    sections: [
      {
        heading: '1. Responsable del tratamiento',
        body: 'Liveboom (“nosotros”) trata datos personales de usuarios de la plataforma web y servicios asociados. Contacto: privacidad@liveboom.app',
      },
      {
        heading: '2. Datos que recopilamos',
        body: 'Identificación y contacto (nombre, correo, usuario), perfil (foto, biografía, fecha de nacimiento), actividad (lives, publicaciones, interacciones), datos técnicos (IP, dispositivo, cookies) y datos de pago procesados por proveedores externos (no almacenamos números completos de tarjeta).',
      },
      {
        heading: '3. Finalidades',
        body: 'Autenticación, operación del servicio, personalización, seguridad, prevención de fraude, soporte, cumplimiento legal y mejora de la plataforma. Con tu consentimiento, comunicaciones promocionales que puedes revocar en cualquier momento.',
      },
      {
        heading: '4. Base legal',
        body: 'Ejecución del contrato (cuenta y servicio), consentimiento (cookies no esenciales, marketing), interés legítimo (seguridad y mejora) y obligación legal cuando corresponda, conforme a la Ley 1581 de 2012 y normas complementarias en Colombia.',
      },
      {
        heading: '5. Compartición',
        body: 'Podemos compartir datos con proveedores de infraestructura (hosting, autenticación Firebase, pagos Wompi, streaming LiveKit) bajo contratos de tratamiento. No vendemos datos personales.',
      },
      {
        heading: '6. Conservación',
        body: 'Conservamos los datos mientras mantengas tu cuenta y el tiempo necesario para obligaciones legales, resolución de disputas y seguridad. Puedes solicitar eliminación sujeta a excepciones legales.',
      },
      {
        heading: '7. Derechos del titular',
        body: 'Puedes acceder, actualizar, rectificar, suprimir y oponerte al tratamiento, así como revocar consentimientos. Escríbenos a privacidad@liveboom.app. También puedes presentar reclamo ante la Superintendencia de Industria y Comercio (SIC).',
      },
      {
        heading: '8. Seguridad',
        body: 'Aplicamos medidas técnicas y organizativas razonables para proteger tus datos. Ningún sistema es 100% seguro; notificaremos incidentes relevantes según la ley.',
      },
      {
        heading: '9. Menores',
        body: 'Liveboom no está dirigido a menores de 18 años. Si detectamos una cuenta de menor, podremos eliminarla.',
      },
    ],
  },
  {
    slug: 'cookies',
    title: 'Política de Cookies',
    updated: '22 de agosto de 2026',
    sections: [
      {
        heading: '1. ¿Qué son las cookies?',
        body: 'Las cookies son archivos pequeños que se guardan en tu dispositivo para recordar preferencias, mantener la sesión y medir el uso del sitio.',
      },
      {
        heading: '2. Cookies que usamos',
        body: 'Esenciales: autenticación y seguridad de sesión (Firebase Auth, tokens). Funcionales: preferencias de interfaz y consentimiento de cookies. Analíticas: métricas agregadas de uso para mejorar Liveboom (solo si aceptas cookies no esenciales).',
      },
      {
        heading: '3. Gestión',
        body: 'Puedes aceptar o rechazar cookies no esenciales desde el banner al entrar. También puedes borrar cookies desde la configuración de tu navegador. Rechazar cookies esenciales puede impedir el inicio de sesión.',
      },
      {
        heading: '4. Terceros',
        body: 'Google (inicio de sesión), Firebase, proveedores de pago y analítica pueden establecer sus propias cookies según sus políticas.',
      },
      {
        heading: '5. Actualizaciones',
        body: 'Podemos actualizar esta política. La fecha de vigencia aparece al inicio del documento.',
      },
      {
        heading: '6. Contacto',
        body: 'privacidad@liveboom.app',
      },
    ],
  },
];

export function getLegalDoc(slug: string) {
  return LEGAL_DOCS.find((doc) => doc.slug === slug) ?? null;
}
