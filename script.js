// Configurações da API
const API_BASE_URL = 'https://api.cnpja.com/office';
const API_KEY = '8b819cfa-5ff1-488e-92d2-15aa45f56e40-70a6dda2-5d80-4d11-bf0e-31616213e4f1';

// Elementos do DOM
const searchForm = document.getElementById('searchForm' );
const dataInicio = document.getElementById('dataInicio');
const dataFim = document.getElementById('dataFim');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMessage = document.getElementById('errorMessage');
const debugInfo = document.getElementById('debugInfo');
const requestUrlSpan = document.getElementById('requestUrl');
const apiResponseSpan = document.getElementById('apiResponse');
const resultsContainer = document.getElementById('resultsContainer');
const noResults = document.getElementById('noResults');
const tableBody = document.getElementById('tableBody');
const resultCount = document.getElementById('resultCount');
const btnSearch = document.querySelector('.btn-search');
const btnExportEmails = document.getElementById('btnExportEmails');
const btnExportPhones = document.getElementById('btnExportPhones');
const btnExportManychat = document.getElementById('btnExportManychat'); // Novo botão

// Variável global para armazenar todos os resultados
let allResults = [];

// Função principal de busca
async function handleSearch(e) {
    e.preventDefault();

    // Validação de datas
    const inicio = new Date(dataInicio.value);
    const fim = new Date(dataFim.value);

    if (inicio > fim) {
        showError('A data de início não pode ser maior que a data de fim.');
        return;
    }

    // Limpar resultados anteriores
    clearResults();
    allResults = []; // Limpa resultados globais
    
    // Ocultar debug
    debugInfo.classList.add('hidden');

    // Mostrar spinner de carregamento
    showLoading(true);
    btnSearch.disabled = true;

    try {
        // Formatar datas para ISO 8601, ajustando para incluir o horário para precisão.
        const dataInicioISO = `${dataInicio.value}T00:00:00Z`;
        const dataFimISO = `${dataFim.value}T23:59:59Z`;

        // Construir URL com parâmetros, solicitando um limite alto (10000)
        const params = new URLSearchParams({
            'founded.gte': dataInicioISO,
            'founded.lte': dataFimISO,
            'company.simei.optant.eq': 'true', // Filtro MEI reativado
            'limit': '5' // Aumentado o limite para buscar mais resultados
        });

        const url = `${API_BASE_URL}?${params.toString()}`;
        requestUrlSpan.textContent = url;
        debugInfo.classList.remove('hidden');

        // Fazer requisição à API
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            apiResponseSpan.textContent = `Status: ${response.status}. Resposta: ${errorText}`;
            throw new Error(`Erro na API: ${response.status} - ${response.statusText}. Detalhes no console e na seção de debug.`);
        }

        const data = await response.json();
        apiResponseSpan.textContent = JSON.stringify(data, null, 2).substring(0, 500) + '...'; // Limita o tamanho do log

        // Processar resultados
        if (data.records && data.records.length > 0) {
            allResults = data.records; // Armazena todos os resultados
            displayResults(allResults); // Exibe os resultados
        } else {
            showNoResults();
        }
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        showError(`Erro ao buscar dados: ${error.message}`);
    } finally {
        showLoading(false);
        btnSearch.disabled = false;
    }
}

// Função de utilidade para extrair o telefone de um registro
function extractPhone(empresa) {
    let phone = 'N/A';
    let phoneData = null;
    let inferredDDD = null;

    // 1. Tenta inferir o DDD a partir do endereço (UF)
    const uf = empresa.address?.state;
    if (uf) {
        inferredDDD = getDDDByState(uf);
    }

    // 2. Tenta extrair o número de telefone de forma mais robusta
    const phoneFields = [
        empresa.company?.phone,
        empresa.phone,
        empresa.phone_alt
    ];

    if (Array.isArray(empresa.phones) && empresa.phones.length > 0) {
        phoneData = empresa.phones[0];
    } else {
        for (const field of phoneFields) {
            if (field) {
                phoneData = field;
                break;
            }
        }
    }

    // 3. Processa o dado encontrado
    if (typeof phoneData === 'string' && phoneData.trim() !== '') {
        phone = formatarTelefone(phoneData, '55', inferredDDD);
    } else if (phoneData && typeof phoneData === 'object') {
        const number = phoneData.number || phoneData.value;
        const ddd = phoneData.area;
        const countryCode = phoneData.countryCode || '55';
        const finalDDD = ddd || inferredDDD;

        if (number) {
            phone = formatarTelefone(number, countryCode, finalDDD);
        }
    }
    
    // 4. Fallback
    if (phone === 'N/A' && Array.isArray(empresa.phones) && empresa.phones.length > 0) {
        const firstPhone = empresa.phones[0];
        if (typeof firstPhone === 'string' && firstPhone.trim() !== '') {
            phone = formatarTelefone(firstPhone, '55', inferredDDD);
        } else if (firstPhone && (firstPhone.number || firstPhone.value)) {
            const ddd = firstPhone.area;
            const countryCode = firstPhone.countryCode || '55';
            const finalDDD = ddd || inferredDDD;
            phone = formatarTelefone(firstPhone.number || firstPhone.value, countryCode, finalDDD);
        }
    }

    return phone;
}

// Função para inferir o DDD a partir da UF (Estado)
function getDDDByState(uf) {
    const dddMap = {
        'AC': '68', 'AL': '82', 'AP': '96', 'AM': '92', 'BA': '71', 'CE': '85', 'DF': '61',
        'ES': '27', 'GO': '62', 'MA': '98', 'MT': '65', 'MS': '67', 'MG': '31', 'PA': '91',
        'PB': '83', 'PR': '41', 'PE': '81', 'PI': '86', 'RJ': '21', 'RN': '84', 'RS': '51',
        'RO': '69', 'RR': '95', 'SC': '48', 'SP': '11', 'SE': '79', 'TO': '63'
    };
    return dddMap[uf.toUpperCase()] || null;
}

// Função de utilidade para extrair o email de um registro
function extractEmail(empresa) {
    let email = 'N/A';
    const emailData = empresa.company?.email || empresa.emails?.[0] || empresa.email;

    if (typeof emailData === 'string' && emailData.trim() !== '') {
        email = emailData;
    } else if (emailData && typeof emailData === 'object' && (emailData.address || emailData.value)) {
        email = emailData.address || emailData.value;
    } else if (Array.isArray(empresa.emails) && empresa.emails.length > 0) {
        const firstEmail = empresa.emails[0];
        if (typeof firstEmail === 'string' && firstEmail.trim() !== '') {
            email = firstEmail;
        } else if (firstEmail && (firstEmail.address || firstEmail.value)) {
            email = firstEmail.address || firstEmail.value;
        }
    }
    return email;
}

// Função para gerar um ID curto aleatório (para evitar spam)
function generateShortId() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// NOVO: Função para exportar contatos formatados para Manychat
function exportManychatContacts() {
    if (allResults.length === 0) {
        alert('Nenhum resultado para exportar.');
        return;
    }

    const header = ['Whatsapp Id', 'First Name', 'Full Name', 'Mensagem'].join(',');
    
    const dataLines = allResults.filter(empresa => {
        // FILTRO: Exclui CNPJs que tenham ".com.br" no email
        const email = extractEmail(empresa);
        return !email.toLowerCase().includes('.com.br');
    }).map(empresa => {
        const razaoSocial = empresa.company?.name || 'N/A';
        
        // Limpar a razão social para remover o CNPJ do início se houver
        const razaoLimpa = razaoSocial.replace(/^[\d\s\.\/-]+/, '').trim();
        
        // Pegar o primeiro nome ou uma versão curta da razão social
        const namePart = razaoLimpa;
        const firstName = namePart.split(' ')[0].replace(/[\d.]/g, '').trim() || 'N/A';
        const fullName = razaoSocial.replace(/[\d.]/g, '').trim();
        
        // O Manychat requer o telefone no formato internacional (+5511999999999)
        const telefoneRaw = extractPhoneRaw(empresa); 

        // Filtra registros sem telefone válido
        if (telefoneRaw === 'N/A' || telefoneRaw.length < 12) {
            return null; 
        }

        // Extrair os primeiros 8 dígitos numéricos da razão social para o link
        const cnpjDigits = razaoSocial.replace(/\D/g, '').substring(0, 8) || '00000000';
        
        // Gerar um ID único curto
        const uniqueId = generateShortId();
        
        // Limitar o tamanho da razão social na mensagem para não estourar o limite de SMS (aprox 160 chars)
        // Mensagem base tem aprox 100-110 caracteres. Sobram ~50 para a Razão Social.
        const razaoCurta = razaoLimpa.substring(0, 30);

        // Mensagem personalizada com Razão Social e ID único
        const mensagem = `Suporte BR: Ola ${razaoCurta}, sua solicitacao esta em analise.\nAcompanhe o Status em:\nhttps://link.com.br/${cnpjDigits}\nPara sair, responda SAIR. Ref:${uniqueId}`;

        return [
            `"${telefoneRaw}"`, 
            `"${firstName}"`, 
            `"${fullName}"`, 
            `"${mensagem}"`,
        ].join(',');
    }).filter(line => line !== null); 

    if (dataLines.length === 0) {
        alert('Nenhum contato válido encontrado para o Manychat.');
        return;
    }

    const csvContent = [header, ...dataLines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mei_manychat_export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Exportação para Manychat concluída! ${dataLines.length} contato(s) exportado(s).`);
}

// Função de utilidade para extrair o telefone no formato RAW (+55DDDNUMERO)
function extractPhoneRaw(empresa) {
    let phoneData = null;
    let inferredDDD = null;

    const uf = empresa.address?.state;
    if (uf) inferredDDD = getDDDByState(uf);

    const phoneFields = [empresa.company?.phone, empresa.phone, empresa.phone_alt];

    if (Array.isArray(empresa.phones) && empresa.phones.length > 0) {
        phoneData = empresa.phones[0];
    } else {
        for (const field of phoneFields) {
            if (field) {
                phoneData = field;
                break;
            }
        }
    }

    let rawNumber = '';
    let countryCode = '55';
    let ddd = inferredDDD;

    if (typeof phoneData === 'string' && phoneData.trim() !== '') {
        rawNumber = phoneData;
    } else if (phoneData && typeof phoneData === 'object') {
        rawNumber = phoneData.number || phoneData.value || '';
        ddd = phoneData.area || inferredDDD;
        countryCode = phoneData.countryCode || '55';
    }

    return formatarTelefoneRaw(rawNumber, countryCode, ddd);
}

// Função para formatar o telefone no formato RAW (+55DDDNUMERO) com correções de 9º dígito
function formatarTelefoneRaw(numero, codigoPais = '55', ddd = null) {
    let numLimpo = numero.replace(/\D/g, '');
    if (!numLimpo) return 'N/A';

    // Remove código do país se já estiver presente
    if (numLimpo.startsWith(codigoPais) && numLimpo.length > 10) {
        numLimpo = numLimpo.substring(codigoPais.length);
    }

    // Se temos DDD e o número não o contém, adiciona
    if (ddd) {
        let dddLimpo = ddd.toString().replace(/\D/g, '');
        if (!numLimpo.startsWith(dddLimpo)) {
            numLimpo = dddLimpo + numLimpo;
        }
    }

    // Agora numLimpo deve ser DDD + Numero
    // Se tiver 10 dígitos (DDD + 8), é fixo ou celular antigo. Adicionamos o 9 para celular.
    // Se tiver 11 dígitos (DDD + 9), já está correto para celular.
    
    if (numLimpo.length === 10) {
        // Regra simples: se o primeiro dígito do número (após DDD) for 6, 7, 8 ou 9, é celular
        const dddParte = numLimpo.substring(0, 2);
        const numeroParte = numLimpo.substring(2);
        if (['6','7','8','9'].includes(numeroParte[0])) {
            numLimpo = dddParte + '9' + numeroParte;
        }
    } else if (numLimpo.length > 11) {
        // Se tiver mais de 11, pode ser lixo no final ou erro de extração. Cortamos.
        numLimpo = numLimpo.substring(0, 11);
    }

    // Validação final: deve ter 11 dígitos (celular) ou 10 (fixo) para ser útil
    if (numLimpo.length < 10) return 'N/A';

    return `+${codigoPais}${numLimpo}`;
}


// Função para exportar dados completos para CSV
function exportData() {
    if (allResults.length === 0) {
        alert('Nenhum resultado para exportar.');
        return;
    }

    const header = ['CNPJ', 'Razão Social', 'Email', 'Telefone', 'Data de Abertura', 'Status'].join(';');
    const filteredResults = allResults.filter(empresa => {
        const email = extractEmail(empresa);
        return !email.toLowerCase().includes('.com.br');
    });

    const dataLines = filteredResults.map(empresa => {
        const cnpj = empresa.taxId || 'N/A';
        const razaoSocial = empresa.company?.name || 'N/A';
        const email = extractEmail(empresa);
        const telefone = extractPhone(empresa); 
        const dataAbertura = formatarData(empresa.founded);
        const status = empresa.status?.text || 'N/A';

        return [
            `"${formatarCNPJ(cnpj)}"`,
            `"${razaoSocial}"`,
            `"${email}"`,
            `"${telefone}"`,
            `"${dataAbertura}"`,
            `"${status}"`
        ].join(';');
    });

    const csvContent = [header, ...dataLines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'empresas_mei_export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Exportação concluída! ${filteredResults.length} registro(s) exportado(s).`);
}

// Função para exportar emails
function exportEmails() {
    if (allResults.length === 0) {
        alert('Nenhum resultado para exportar.');
        return;
    }

    const emails = allResults
        .map(empresa => extractEmail(empresa))
        .filter(email => email !== 'N/A' && !email.toLowerCase().includes('.com.br'));

    if (emails.length === 0) {
        alert('Nenhum email válido (sem .com.br) encontrado.');
        return;
    }

    const emailsText = emails.join('\n');
    const blob = new Blob([emailsText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'emails_mei_export.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Exportação de emails concluída! ${emails.length} email(s) exportado(s).`);
}

// Função para exportar telefones
function exportPhones() {
    if (allResults.length === 0) {
        alert('Nenhum resultado para exportar.');
        return;
    }

    const phones = allResults
        .filter(empresa => {
            const email = extractEmail(empresa);
            return !email.toLowerCase().includes('.com.br');
        })
        .map(empresa => extractPhone(empresa))
        .filter(phone => phone !== 'N/A');

    if (phones.length === 0) {
        alert('Nenhum telefone válido encontrado.');
        return;
    }

    const phonesText = phones.join('\n');
    const blob = new Blob([phonesText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'telefones_mei_export.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Exportação de telefones concluída! ${phones.length} telefone(s) exportado(s).`);
}

// Função para exibir os resultados na tabela
function displayResults(results) {
    tableBody.innerHTML = '';
    
    const filteredResults = results.filter(empresa => {
        const email = extractEmail(empresa);
        return !email.toLowerCase().includes('.com.br');
    });

    if (filteredResults.length === 0) {
        showNoResults();
        return;
    }

    filteredResults.forEach(empresa => {
        const row = tableBody.insertRow();
        const cnpj = empresa.taxId || 'N/A';
        const razaoSocial = empresa.company?.name || 'N/A';
        const email = extractEmail(empresa);
        const telefone = extractPhone(empresa);
        const dataAbertura = formatarData(empresa.founded);
        const status = empresa.status?.text || 'N/A';
        const statusClass = status.toLowerCase().includes('ativa') ? 'status-active' : 'status-inactive';

        row.insertCell().textContent = formatarCNPJ(cnpj);
        row.insertCell().textContent = razaoSocial;
        row.insertCell().textContent = email;
        row.insertCell().textContent = telefone;
        row.insertCell().textContent = dataAbertura;
        row.insertCell().innerHTML = `<span class="${statusClass}">${status}</span>`;
    });

    resultCount.textContent = `Encontrados ${filteredResults.length} registro(s) após filtragem.`;
    resultsContainer.classList.remove('hidden');
    noResults.classList.add('hidden');
    errorMessage.classList.add('hidden');
    
    btnExportEmails.classList.remove('hidden');
    btnExportPhones.classList.remove('hidden');
    btnExportManychat.classList.remove('hidden');
}

// Funções de utilidade de UI
function showLoading(isLoading) {
    if (isLoading) {
        loadingSpinner.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
        noResults.classList.add('hidden');
        errorMessage.classList.add('hidden');
        btnExportEmails.classList.add('hidden');
        btnExportPhones.classList.add('hidden');
        btnExportManychat.classList.add('hidden');
    } else {
        loadingSpinner.classList.add('hidden');
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    noResults.classList.add('hidden');
    btnExportEmails.classList.add('hidden');
    btnExportPhones.classList.add('hidden');
    btnExportManychat.classList.add('hidden');
}

function showNoResults() {
    noResults.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    errorMessage.classList.add('hidden');
    btnExportEmails.classList.add('hidden');
    btnExportPhones.classList.add('hidden');
    btnExportManychat.classList.add('hidden');
}

function clearResults() {
    tableBody.innerHTML = '';
    resultsContainer.classList.add('hidden');
    noResults.classList.add('hidden');
    errorMessage.classList.add('hidden');
    btnExportEmails.classList.add('hidden');
    btnExportPhones.classList.add('hidden');
    btnExportManychat.classList.add('hidden');
}

// Funções de formatação
function formatarCNPJ(cnpj) {
    const numLimpo = cnpj.replace(/\D/g, '');
    if (numLimpo.length === 14) {
        return numLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    }
    return cnpj;
}

function formatarTelefone(numero, codigoPais = '55', ddd = null) {
    let numLimpo = numero.replace(/\D/g, '');
    if (numLimpo.startsWith(codigoPais)) {
        numLimpo = numLimpo.substring(codigoPais.length);
    }
    if (ddd) {
        let dddLimpo = ddd.toString().replace(/\D/g, '');
        if (numLimpo.startsWith(dddLimpo)) {
            numLimpo = numLimpo.substring(dddLimpo.length);
        }
        if (numLimpo.length === 8 || numLimpo.length === 9) {
            numLimpo = dddLimpo + numLimpo;
        }
    }

    if (numLimpo.length === 11) {
        return `(${numLimpo.substring(0, 2)}) ${numLimpo.substring(2, 7)}-${numLimpo.substring(7)}`;
    } else if (numLimpo.length === 10) {
        return `(${numLimpo.substring(0, 2)}) ${numLimpo.substring(2, 6)}-${numLimpo.substring(6)}`;
    } else if (numLimpo.length === 9) {
        return `${numLimpo.substring(0, 5)}-${numLimpo.substring(5)}`;
    } else if (numLimpo.length === 8) {
        return `${numLimpo.substring(0, 4)}-${numLimpo.substring(4)}`;
    }
    return numero;
}

function formatarData(data) {
    if (!data) return 'N/A';
    try {
        const date = new Date(data);
        return date.toLocaleDateString('pt-BR');
    } catch (error) {
        return data;
    }
}

function setDefaultDates() {
    const hoje = new Date();
    const seisMeses = new Date(hoje.getTime() - 180 * 24 * 60 * 60 * 1000);
    dataFim.value = hoje.toISOString().split('T')[0];
    dataInicio.value = seisMeses.toISOString().split('T')[0];
}

setDefaultDates();

searchForm.addEventListener('submit', handleSearch);
document.addEventListener('click', function(e) {
    if (e.target.id === 'btnExportEmails') {
        exportEmails();
    } else if (e.target.id === 'btnExportPhones') {
        exportPhones();
    } else if (e.target.id === 'btnExportManychat') {
        exportManychatContacts();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const exportEmailButton = document.getElementById('btnExportEmails');
    const exportPhoneButton = document.getElementById('btnExportPhones');
    const exportManychatButton = document.getElementById('btnExportManychat');
    if (exportEmailButton) exportEmailButton.classList.add('hidden');
    if (exportPhoneButton) exportPhoneButton.classList.add('hidden');
    if (exportManychatButton) exportManychatButton.classList.add('hidden');
});
