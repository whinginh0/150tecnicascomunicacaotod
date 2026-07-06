import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const brevoApiKey = Deno.env.get('BREVO_API_KEY') ?? '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json()
    console.log('Webhook GG Checkout recebido:', body)

    // Extract fields from GG Checkout payload format
    const email = (body.customer?.email || body.email || body.client?.email)?.trim().toLowerCase()
    const nome = body.customer?.name || body.nome || body.name || body.client?.name || 'Cliente'

    // Determine plan from product title
    let plano = 'basico'
    const mainProductTitle = body.product?.title || body.product?.name || body.product_name || ''
    const hasCompleto = mainProductTitle.toLowerCase().includes('completo') ||
      (Array.isArray(body.products) && body.products.some((p: any) =>
        p.title?.toLowerCase().includes('completo') || p.name?.toLowerCase().includes('completo')
      ))
    if (hasCompleto || body.plano === 'completo' || (body.plan && String(body.plan).toLowerCase().includes('completo'))) {
      plano = 'completo'
    }

    // Detect approval
    const event = body.event || ''
    const paymentStatus = body.payment?.status || body.status || ''
    const paymentMethod = body.payment?.paymentMethod || body.payment?.method || ''
    const paymentAmount = body.payment?.amount || null
    const isApproved = event.includes('.paid') || paymentStatus === 'paid' || paymentStatus === 'approved' || paymentStatus === 'completed' || paymentStatus === 'pago'

    // Helper: log to webhookgg
    async function logWebhook(brevoSuccess: boolean | null, brevoMessage: string | null, processingError: string | null) {
      try {
        await supabase.from('webhookgg').insert({
          event,
          email: email || null,
          nome: nome || null,
          plano,
          payment_status: paymentStatus,
          payment_method: paymentMethod,
          payment_amount: paymentAmount,
          product_title: mainProductTitle || null,
          raw_payload: body,
          brevo_success: brevoSuccess,
          brevo_message: brevoMessage,
          processing_error: processingError,
        })
      } catch (logErr) {
        console.error('Erro ao registrar na webhookgg:', logErr)
      }
    }

    if (!email) {
      await logWebhook(null, null, 'Email não fornecido no payload.')
      return new Response(JSON.stringify({ error: 'Email não fornecido no payload.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!isApproved) {
      await logWebhook(null, null, null)
      return new Response(JSON.stringify({ message: `Evento '${event}' / status '${paymentStatus}' não processado.` }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Upsert client
    const { data: clientData, error: dbError } = await supabase
      .from('clientes')
      .upsert(
        { email, nome, plano, created_at: new Date().toISOString() },
        { onConflict: 'email' }
      )
      .select()
      .single()

    if (dbError) {
      console.error('Erro ao salvar no banco:', dbError)
      await logWebhook(null, null, dbError.message)
      throw dbError
    }

    console.log('Cliente salvo com sucesso:', clientData)

    if (!brevoApiKey) {
      await logWebhook(false, 'BREVO_API_KEY não configurada.', null)
      return new Response(JSON.stringify({ success: true, message: 'Acesso criado, mas Brevo não configurado.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accessLink = 'https://www.todilustrado.hyzencompra.shop/login'
    const planoLabel = plano === 'completo' ? 'Completo' : 'Básico'

    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Acesso Liberado - 150 Técnicas TOD</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f4f8;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;border-radius:20px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.06),0 16px 48px rgba(0,0,0,0.18);border:1px solid #dde3ee;">

          <!-- HEADER GRADIENT -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a6fc4 0%,#0ea5e9 60%,#38bdf8 100%);padding:48px 40px 40px;text-align:center;">
              <div style="display:inline-block;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);border-radius:50px;padding:6px 18px;margin-bottom:20px;">
                <span style="color:#e0f2fe;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">&#127891; Acesso Liberado</span>
              </div>
              <h1 style="margin:0 0 8px;color:#ffffff;font-size:30px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;">Parabéns, ${nome}! &#127881;</h1>
              <p style="margin:0;color:#bae6fd;font-size:16px;font-weight:400;">Sua jornada começa agora.</p>
            </td>
          </tr>

          <!-- WHITE BODY -->
          <tr>
            <td style="background:#ffffff;padding:40px;">

              <!-- Intro -->
              <p style="margin:0 0 24px;color:#374151;font-size:16px;line-height:1.7;">Olá, <strong>${nome}</strong>! Sua compra foi <strong style="color:#16a34a;">aprovada com sucesso</strong> e seu acesso ao curso está 100% liberado. Estamos muito felizes em ter você nessa jornada! &#128519;</p>

              <!-- Plan badge -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1px solid #bfdbfe;border-radius:14px;padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td>
                          <p style="margin:0 0 4px;color:#1e40af;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Seu Plano</p>
                          <p style="margin:0;color:#1d4ed8;font-size:20px;font-weight:800;">150 Técnicas TOD &mdash; ${planoLabel}</p>
                        </td>
                        <td align="right">
                          <span style="background:#1d4ed8;color:#ffffff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:50px;white-space:nowrap;">&#9989; Ativo</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Info rows -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
                <tr style="background:#f9fafb;">
                  <td style="padding:14px 20px;border-bottom:1px solid #e5e7eb;">
                    <p style="margin:0;color:#6b7280;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">Nome cadastrado</p>
                    <p style="margin:4px 0 0;color:#111827;font-size:15px;font-weight:600;">${nome}</p>
                  </td>
                </tr>
                <tr style="background:#ffffff;">
                  <td style="padding:14px 20px;">
                    <p style="margin:0;color:#6b7280;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">E-mail de acesso</p>
                    <p style="margin:4px 0 0;color:#111827;font-size:15px;font-weight:600;">${email}</p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
                <tr>
                  <td align="center">
                    <a href="${accessLink}" target="_blank"
                      style="display:inline-block;background:linear-gradient(135deg,#1a6fc4,#0ea5e9);color:#ffffff;text-decoration:none;font-size:17px;font-weight:800;padding:18px 48px;border-radius:50px;letter-spacing:0.3px;box-shadow:0 8px 24px rgba(14,165,233,0.40);"
                    >&#128274; Acessar Área de Membros</a>
                  </td>
                </tr>
              </table>

              <!-- Plain link fallback -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td align="center" style="padding:8px 0;">
                    <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;">Caso o botão não funcione, copie e cole o link abaixo no seu navegador:</p>
                    <a href="${accessLink}" target="_blank" style="color:#0ea5e9;font-size:12px;word-break:break-all;text-decoration:underline;">${accessLink}</a>
                  </td>
                </tr>
              </table>

              <!-- Warning box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:#fff7ed;border-left:4px solid #f97316;border-radius:0 12px 12px 0;padding:18px 20px;">
                    <p style="margin:0 0 6px;color:#c2410c;font-size:13px;font-weight:700;">&#9888;&#65039; AVISO IMPORTANTE</p>
                    <p style="margin:0;color:#7c2d12;font-size:13.5px;line-height:1.6;">O login na Área de Membros é realizado <strong>exclusivamente através do seu e-mail de compra</strong> (${email}). Não é necessária nenhuma senha adicional.</p>
                  </td>
                </tr>
              </table>

              <!-- Steps -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr><td><p style="margin:0 0 14px;color:#111827;font-size:14px;font-weight:700;">&#128640; Como acessar em 3 passos:</p></td></tr>
                <tr>
                  <td>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:0 0 12px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="background:#0ea5e9;color:#fff;font-size:12px;font-weight:800;min-width:26px;width:26px;height:26px;border-radius:50%;text-align:center;vertical-align:middle;">1</td>
                              <td style="padding-left:12px;color:#374151;font-size:14px;">Clique no botão <strong>"Acessar Área de Membros"</strong> acima</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 0 12px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="background:#0ea5e9;color:#fff;font-size:12px;font-weight:800;min-width:26px;width:26px;height:26px;border-radius:50%;text-align:center;vertical-align:middle;">2</td>
                              <td style="padding-left:12px;color:#374151;font-size:14px;">Digite seu e-mail: <strong>${email}</strong></td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="background:#0ea5e9;color:#fff;font-size:12px;font-weight:800;min-width:26px;width:26px;height:26px;border-radius:50%;text-align:center;vertical-align:middle;">3</td>
                              <td style="padding-left:12px;color:#374151;font-size:14px;">Pronto! Explore todo o conteúdo do seu plano &#127775;</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr><td style="border-top:1px solid #e5e7eb;"></td></tr>
              </table>

              <!-- Support via Instagram -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                <tr>
                  <td style="background:#fdf4ff;border:1px solid #e9d5ff;border-radius:12px;padding:18px 20px;text-align:center;">
                    <p style="margin:0 0 6px;color:#7e22ce;font-size:13px;font-weight:700;">&#128247; Precisa de suporte?</p>
                    <p style="margin:0;color:#6b21a8;font-size:13.5px;line-height:1.6;">O atendimento é realizado <strong>exclusivamente pelo Instagram</strong>.<br/>Nos chame por lá: <a href="https://instagram.com/todilustrado" target="_blank" style="color:#9333ea;font-weight:800;text-decoration:none;">@todilustrado</a></p>
                  </td>
                </tr>
              </table>

              <!-- Closing -->
              <p style="margin:24px 0 0;color:#374151;font-size:14px;line-height:1.7;">Com carinho,<br/><strong style="color:#0ea5e9;">Equipe 150 Técnicas TOD</strong></p>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f0f4f8;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 4px;color:#94a3b8;font-size:12px;">&copy; 2026 150 T&eacute;cnicas TOD &mdash; Todos os direitos reservados.</p>
              <p style="margin:0;color:#cbd5e1;font-size:11px;">Este é um e-mail automático de liberação de acesso. Por favor, guarde-o em local seguro.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`

    const emailPayload = {
      sender: { name: '150 Técnicas TOD', email: 'suporte@todilustrado.hyzencompra.shop' },
      to: [{ email: email, name: nome }],
      subject: 'Parabéns! Seu acesso ao 150 Técnicas TOD está liberado ✅',
      htmlContent,
    }

    let brevoSuccess = false
    let brevoMessage = ''
    try {
      const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoApiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
      })
      brevoMessage = await brevoResponse.text()
      if (!brevoResponse.ok) {
        console.error('Erro ao enviar e-mail via Brevo:', brevoMessage)
        brevoSuccess = false
      } else {
        console.log('E-mail enviado via Brevo com sucesso!')
        brevoSuccess = true
      }
    } catch (e: any) {
      console.error('Exception ao chamar Brevo:', e.message)
      brevoSuccess = false
      brevoMessage = e.message
    }

    await logWebhook(brevoSuccess, brevoMessage, null)

    return new Response(JSON.stringify({ success: true, message: 'Acesso criado.', brevo: { success: brevoSuccess, message: brevoMessage } }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('Erro na execução do webhook:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
