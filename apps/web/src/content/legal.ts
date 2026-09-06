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
        body: 'Eres responsable de la actividad en tu cuenta. Está prohibido el acoso, contenido ilegal, abuso o explotación sexual infantil (CSAE), material de abuso sexual infantil (CSAM), suplantación, spam, malware y cualquier uso que vulnere derechos de terceros. Podemos moderar, limitar o cerrar cuentas que incumplan estas reglas. Ver Estándares de seguridad infantil: https://liveboomapp.com/legal/seguridad-infantil',
      },
      {
        heading: '4. Contenido y propiedad',
        body: 'Conservas los derechos sobre el contenido que publicas. Al publicar en Liveboom nos concedes una licencia no exclusiva, mundial y gratuita para alojar, mostrar y distribuir tu contenido dentro del servicio. No vendemos tu contenido a terceros sin tu consentimiento.',
      },
      {
        heading: '5. Coins y pagos',
        body: 'Los coins son créditos virtuales para uso dentro de la plataforma. Las compras procesadas por proveedores de pago (por ejemplo Wompi) están sujetas a sus políticas. El retiro de coins a pesos colombianos (COP) usa el equivalente justo de 1 coin = $50 COP, sujeto a verificación de identidad y medios de pago. Los reembolsos se evalúan según la ley aplicable y las políticas de la tienda de pagos.',
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
        body: 'Para consultas legales y soporte: macroreal2026@gmail.com',
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
        body: 'Liveboom (“nosotros”) trata datos personales de usuarios de la plataforma web y servicios asociados. Contacto: macroreal2026@gmail.com',
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
        body: 'Puedes acceder, actualizar, rectificar, suprimir y oponerte al tratamiento, así como revocar consentimientos. Escríbenos a macroreal2026@gmail.com. También puedes presentar reclamo ante la Superintendencia de Industria y Comercio (SIC).',
      },
      {
        heading: '8. Seguridad',
        body: 'Aplicamos medidas técnicas y organizativas razonables para proteger tus datos. Ningún sistema es 100% seguro; notificaremos incidentes relevantes según la ley.',
      },
      {
        heading: '9. Menores',
        body: 'Liveboom no está dirigido a menores de 18 años. Si detectamos una cuenta de menor, podremos eliminarla. Consulta también nuestros Estándares de seguridad infantil: https://liveboomapp.com/legal/seguridad-infantil',
      },
    ],
  },
  {
    slug: 'seguridad-infantil',
    title: 'Estándares de seguridad infantil',
    updated: '4 de septiembre de 2026',
    sections: [
      {
        heading: '1. Compromiso de Liveboom',
        body: 'Liveboom es una red social de transmisiones en vivo, contenido corto y comunidad. Nos oponemos al abuso y explotación sexual infantil (CSAE, por sus siglas en inglés) y al material de abuso sexual infantil (CSAM). Está estrictamente prohibido crear, subir, transmitir, compartir, solicitar o almacenar CSAM o cualquier contenido o conducta que sexualmente explote, abuse o ponga en peligro a menores.',
      },
      {
        heading: '2. Solo mayores de 18 años',
        body: 'Liveboom está dirigido exclusivamente a personas de 18 años o más. No está diseñado para niños. Si detectamos una cuenta de un menor, podemos suspenderla y eliminar la información asociada, sin perjuicio de otras acciones legales.',
      },
      {
        heading: '3. Contenido y conductas prohibidas',
        body: 'Además de lo establecido en nuestros Términos, está prohibido: CSAM (fotos, videos u otras representaciones visuales); grooming o captación de menores; sextorsión; tráfico sexual de menores; y cualquier intento de eludir controles de edad o de ocultar la participación de menores en lives, clips, mensajes o perfiles.',
      },
      {
        heading: '4. Cómo actuamos ante CSAM',
        body: 'Cuando tengamos conocimiento efectivo de CSAM o de conductas CSAE en Liveboom: (a) retiramos o bloqueamos el contenido; (b) restringimos o cerramos las cuentas involucradas; (c) conservamos evidencia según la ley aplicable; y (d) cooperamos con autoridades competentes cuando corresponda. Actuamos conforme a estos estándares, a nuestros Términos y a la legislación aplicable.',
      },
      {
        heading: '5. Cómo reportar',
        body: 'Si ves contenido o conducta que pueda afectar la seguridad de menores, repórtalo de inmediato escribiendo a macroreal2026@gmail.com (asunto: “Seguridad infantil / CSAM”) e incluye enlaces, capturas y el usuario involucrado cuando sea posible. También puedes usar los canales de soporte o denuncia disponibles dentro de la app. No reenvíes archivos de CSAM; describe el hallazgo y facilita la ubicación en la plataforma.',
      },
      {
        heading: '6. Cumplimiento legal',
        body: 'Liveboom se compromete a cumplir las leyes aplicables en materia de protección de menores y prevención de CSAE/CSAM, incluidas las obligaciones de denuncia y cooperación con autoridades cuando la ley lo exija.',
      },
      {
        heading: '7. Punto de contacto CSAM',
        body: 'Contacto designado para prácticas de prevención de CSAM y cumplimiento de la política de estándares de seguridad infantil de Google Play: macroreal2026@gmail.com. Nombre de referencia del contacto: Equipo Legal Liveboom.',
      },
      {
        heading: '8. Relación con otros documentos',
        body: 'Estos estándares complementan los Términos y Condiciones y el Aviso de Privacidad de Liveboom. En caso de conflicto sobre seguridad infantil y CSAM, prevalecen estas normas de protección.',
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
        body: 'macroreal2026@gmail.com',
      },
    ],
  },
];

export function getLegalDoc(slug: string) {
  return LEGAL_DOCS.find((doc) => doc.slug === slug) ?? null;
}
