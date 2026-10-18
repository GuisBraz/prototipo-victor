/** Traduz erros do Firebase/callables em mensagens claras, sem expor detalhes internos. */
export function friendlyError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  const map: Record<string, string> = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/user-not-found": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/weak-password": "A senha deve ter pelo menos 8 caracteres.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/network-request-failed": "Falha de rede. Verifique sua conexão.",
    "functions/unauthenticated": "Sua sessão expirou. Entre novamente.",
    "functions/permission-denied": "Você não tem permissão para esta operação.",
    "functions/already-exists": "Já existe um projeto com este código.",
    "functions/invalid-argument": "Dados inválidos. Revise os campos.",
    "functions/resource-exhausted": "Limite atingido. Contate o administrador.",
    "functions/not-found": "Item não encontrado.",
    "functions/failed-precondition": "Esta operação não é possível no estado atual.",
    "storage/unauthorized": "Sem permissão para enviar este arquivo.",
    "storage/canceled": "Envio cancelado.",
    "storage/retry-limit-exceeded": "Falha de rede durante o envio. Tente novamente.",
  };

  return map[code] ?? "Não foi possível concluir a operação. Tente novamente.";
}
