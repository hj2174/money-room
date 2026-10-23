// Supabase 라이브러리를 인터넷(CDN)에서 바로 불러오는 방식입니다.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://inejrzpzqfsptlkrpuug.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_f55CYws8Tlk7ArIOabEUig_e3Hc_fG7'

// 금고 문을 열어주는 클라이언트 객체를 생성해서 내보냅니다.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)