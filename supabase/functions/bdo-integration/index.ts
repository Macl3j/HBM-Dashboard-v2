import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, config, payload } = await req.json()
    
    // Determine BDO API Base URL
    const baseUrl = config.environment === 'test' 
      ? 'https://test-api.bdo.mos.gov.pl' 
      : 'https://api.bdo.mos.gov.pl'

    if (action === 'create_planned_kpo') {
      // 1. Get Authentication Token
      const tokenResponse = await fetch(`${baseUrl}/api/Auth/generateToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ClientId: config.client_id,
          ClientSecret: config.client_secret
        })
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        throw new Error(`BDO Auth Failed: ${errorText}`)
      }

      const { Token } = await tokenResponse.json()

      // 2. Create Planned KPO
      const bdoPayload = {
        EupId: config.eup_id,
        WasteCodeId: payload.WasteCodeId,
        WasteMass: payload.WasteMass,
        PlannedTransportTime: payload.PlannedTransportTime,
        VehicleRegNumber: payload.VehicleRegNumber,
        AdditionalInfo: payload.AdditionalInfo,
        ReceiverId: config.default_receiver_id,
        CarrierId: config.default_carrier_id
      }

      const kpoResponse = await fetch(`${baseUrl}/api/Kpo/createPlannedKpo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Token}`
        },
        body: JSON.stringify(bdoPayload)
      })

      if (!kpoResponse.ok) {
        const errorText = await kpoResponse.text()
        throw new Error(`BDO KPO Creation Failed: ${errorText}`)
      }

      const result = await kpoResponse.json()
      
      // BDO API usually wraps results in a "Data" property
      const responseData = result.Data || result;

      return new Response(JSON.stringify(responseData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    throw new Error('Unsupported action')

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
