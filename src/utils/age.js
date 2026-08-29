function calculateAge(dateOfBirthStr) {
  if (!dateOfBirthStr) return '';
  try {
    const birthDate = new Date(dateOfBirthStr);
    const today = new Date();
    if (isNaN(birthDate.getTime()) || birthDate > today) return '';
    let years = today.getFullYear() - birthDate.getFullYear();
    let months = today.getMonth() - birthDate.getMonth();
    let days = today.getDate() - birthDate.getDate();
    if (days < 0) {
      const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      days += prevMonth.getDate();
      months -= 1;
    }
    if (months < 0) { months += 12; years -= 1; }
    const parts = [];
    if (years > 0) parts.push(years === 1 ? 'سنة' : years === 2 ? 'سنتان' : years <= 10 ? `${years} سنوات` : `${years} سنة`);
    if (months > 0) parts.push(months === 1 ? 'شهر' : months === 2 ? 'شهران' : months <= 10 ? `${months} أشهر` : `${months} شهر`);
    if (days > 0) parts.push(days === 1 ? 'يوم' : days === 2 ? 'يومان' : days <= 10 ? `${days} أيام` : `${days} يوم`);
    return parts.length ? parts.join(' و ') : 'حديث الولادة';
  } catch (e) { return ''; }
}

module.exports = { calculateAge };
